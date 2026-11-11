import { readSSE, splitSpeech, type UserDetails } from "./protocol";

interface ChatContext {
  contactId?: string;
  contactName?: string;
  conversationId?: string;
  userDetails: UserDetails;
}

const MAX_AI_RETRIES = 3;
const AI_RETRY_DELAYS_MS = [500, 1000, 2000];

function logAIError(context: string, attempt: number, conversationId: string | undefined, error: unknown, details?: Record<string, unknown>) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[Call] ${context} (attempt ${attempt}/${MAX_AI_RETRIES})`, {
    conversationId: conversationId ?? null,
    error: err.message,
    errorName: err.name,
    ...details,
  });
}

interface ReplyCallbacks {
  onConversation: (conversationId: string) => Promise<void>;
  onAudio: (audio: string, format: string) => Promise<void>;
  onReply?: (text: string) => Promise<void>;
}

export function backendConfig() {
  const value = process.env.AI_BACKEND;
  if (!value) throw new Error("AI_BACKEND is not configured");
  const base = new URL(value);
  if (!["https:", "http:"].includes(base.protocol)) throw new Error("Invalid AI_BACKEND protocol");
  return {
    base: base.toString().replace(/\/$/, ""),
    agentId: process.env.AGENT_ID || "6aa5275481fe34e0803a2371",
    voiceId: process.env.VOICE_ID || "19STyYD15bswVz51nqLf",
    serviceToken: process.env.AI_BACKEND_KEY || "",
  };
}

async function tts(
  text: string,
  signal: AbortSignal,
  conversationId?: string,
): Promise<{ audio: string; format: string }> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_AI_RETRIES; attempt++) {
    const timedSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
    let size = 0;

    try {
      const config = backendConfig();
      const response = await fetch(`${config.base}/api/voices/elevenlabs/tts/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.serviceToken ? { "Authorization": `Bearer ${config.serviceToken}` } : {}),
        },
        body: JSON.stringify({ voiceId: config.voiceId, text }),
        signal: timedSignal,
        cache: "no-store",
      });

      if (!response.ok || !response.body) {
        throw new Error(`Voice generation failed: HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 8 * 1024 * 1024) {
            throw new Error("Voice response is too large");
          }
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }

      if (!size) {
        throw new Error("Voice generation returned empty audio");
      }

      const mime = response.headers.get("content-type")?.split(";")[0];
      const format = mime === "audio/wav" ? "wav" : mime === "audio/ogg" ? "ogg" : mime === "audio/flac" ? "flac" : "mp3";
      const audio = Buffer.concat(chunks).toString("base64");

      if (attempt > 0) {
        console.log(`[Call] TTS succeeded on retry ${attempt + 1}`, { conversationId, textLength: text.length });
      }

      return { audio, format };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logAIError("TTS error", attempt + 1, conversationId, lastError, { textLength: text.length });

      if (signal.aborted) throw lastError;
      if (attempt < MAX_AI_RETRIES - 1) {
        const delayMs = AI_RETRY_DELAYS_MS[attempt] ?? 2000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError ?? new Error("Voice generation failed after retries");
}

export async function speakText(text: string, signal: AbortSignal, callbacks: ReplyCallbacks, conversationId?: string) {
  const chunks = splitSpeech(text);
  for (let index = 0; index < chunks.length; index++) {
    signal.throwIfAborted();
    const audio = await tts(chunks[index], signal, conversationId);
    await callbacks.onAudio(audio.audio, audio.format);
  }
}

/**
 * Starts voice generation before AI finishes. Awaiting each bounded speech
 * chunk provides backpressure and keeps audio ordering deterministic.
 */
export async function streamReply(
  message: string,
  context: ChatContext,
  signal: AbortSignal,
  callbacks: ReplyCallbacks,
  preFetchedResponse?: Promise<Response>,
): Promise<{ conversationId: string; text: string }> {
  let conversationId = context.conversationId;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_AI_RETRIES; attempt++) {
    const timedSignal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
    let fullText = "";
    let pendingSpeech = "";
    let finished = false;
    let streamStage = "init";

    try {
      streamStage = "fetch";
      const response = preFetchedResponse && attempt === 0
        ? await preFetchedResponse
        : await ((): Promise<Response> => {
            const config = backendConfig();
            return fetch(`${config.base}/api/agents/${encodeURIComponent(config.agentId)}/chat`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(config.serviceToken ? { "Authorization": `Bearer ${config.serviceToken}` } : {}),
              },
              body: JSON.stringify({
                message,
                ...context,
                conversationId,
                userDetails: {
                  id: context.contactId || "",
                  name: context.contactName || "",
                  email: context.userDetails.email || "",
                  phone: context.userDetails.phone || "",
                  role: "customer",
                },
                ghlContactId: context.contactId,
              }),
              signal: timedSignal,
              cache: "no-store",
            });
          })();

      if (!response.ok || !response.body) {
        throw new Error(`The advisor service is temporarily unavailable (HTTP ${response.status})`);
      }

      streamStage = "read-sse";
      for await (const event of readSSE(response.body, timedSignal, 256 * 1024)) {
        if (event.data === "[DONE]") { finished = true; break; }
        let data: { conversationId?: unknown; text?: unknown };
        try {
          data = JSON.parse(event.data) as typeof data;
        } catch {
          throw new Error("The advisor returned an invalid response");
        }
        if (!data || typeof data !== "object") throw new Error("The advisor returned an invalid response");
        if (event.event === "error") {
          throw new Error("The advisor could not complete this turn");
        }
        if (event.event === "meta" && typeof data.conversationId === "string" && !conversationId) {
          if (data.conversationId.length > 128) throw new Error("Invalid conversation identifier");
          conversationId = data.conversationId;
          await callbacks.onConversation(conversationId);
        }
        if (event.event === "delta" && typeof data.text === "string") {
          fullText += data.text;
          pendingSpeech += data.text;
          if (fullText.length > 12_000) throw new Error("The advisor response is too long");
          // Keep the final sentence buffered until more text or the done event.
          // Intl.Segmenter protects abbreviations; tiny fragments are grouped.
          const segments = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(pendingSpeech)];
          if (conversationId && segments.length > 1) {
            const boundary = segments[segments.length - 1].index;
            if (boundary >= 80) {
              streamStage = "tts";
              await speakText(pendingSpeech.slice(0, boundary), timedSignal, callbacks, conversationId);
              streamStage = "read-sse";
              pendingSpeech = pendingSpeech.slice(boundary);
            }
          }
        }
        if (event.event === "done") { finished = true; break; }
      }

      if (!finished || !conversationId || !fullText.trim()) {
        throw new Error("The advisor response was interrupted");
      }

      await callbacks.onReply?.(fullText);
      if (pendingSpeech.trim()) {
        streamStage = "tts-final";
        await speakText(pendingSpeech, timedSignal, callbacks, conversationId);
      }

      if (attempt > 0) {
        console.log(`[Call] AI stream succeeded on retry ${attempt + 1}`, { conversationId, textLength: fullText.length });
      }

      return { conversationId, text: fullText };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logAIError("AI stream error", attempt + 1, conversationId, lastError, {
        streamStage,
        textReceived: fullText.length,
        messageLength: message.length,
      });

      if (signal.aborted) throw lastError;

      // Don't retry if we already sent audio to the client - partial responses can't be cleanly retried
      if (fullText.length > 0 || pendingSpeech.length > 0) {
        console.error(`[Call] Cannot retry - partial response already sent to client`, {
          conversationId,
          attempt: attempt + 1,
          partialTextLength: fullText.length,
        });
        throw lastError;
      }

      if (attempt < MAX_AI_RETRIES - 1) {
        const delayMs = AI_RETRY_DELAYS_MS[attempt] ?? 2000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError ?? new Error("AI stream failed after retries");
}

const DEFAULT_WEBHOOK = "https://services.leadconnectorhq.com/hooks/mT1ydY9XA0GOQLyWcJWq/webhook-trigger/4ba3a403-9e74-464e-9291-31d84d7e4450";

export async function notifyConversation(
  contactId: string,
  conversationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  // An explicitly empty CALL_WEBHOOK_URL disables the CRM webhook entirely;
  // it must never fall back to the default (which belongs to another project).
  if (process.env.CALL_WEBHOOK_URL === "") return false;
  try {
    const response = await fetch(process.env.CALL_WEBHOOK_URL || DEFAULT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `${contactId}:${conversationId}` },
      body: JSON.stringify({ contactId, conversationId }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}
