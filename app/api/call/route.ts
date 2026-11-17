import { randomUUID } from "node:crypto";
import { backendConfig, notifyConversation, speakText, streamReply, synthesizeGuestContactId } from "@/lib/call/backend";
import { encodeSSE, parseCallInput, parseSessionId, readJson, RequestError, type CallInput } from "@/lib/call/protocol";
import {
  acquireSession, CallMessage, CallSession, claimMessage, endSession, ensureCallStore,
  IDLE_MS, LEASE_MS, openCallChanges, releaseSession, warmCallStore,
} from "@/lib/call/store";
import { Wakeup } from "@/lib/call/wakeup";

export const maxDuration = 300;

// Pre-warm MongoDB connection at module load time so the first request
// doesn't pay the ~3.7s connection + index creation cost.
warmCallStore();

export async function POST(req: Request) {
  const owner = randomUUID();
  const requestId = randomUUID();
  let session: Awaited<ReturnType<typeof acquireSession>> | undefined;
  let changes: ReturnType<typeof openCallChanges> | undefined;
  const controller = new AbortController();
  const abortRequest = () => {
    controller.abort(req.signal.reason);
  };
  req.signal.addEventListener("abort", abortRequest, { once: true });
  if (req.signal.aborted) abortRequest();

  let input: CallInput | undefined;
  try {
    input = parseCallInput(await readJson(req));
    backendConfig();
    await ensureCallStore();
    controller.signal.throwIfAborted();
    session = await acquireSession(input, owner);
    // Fire the AI greeting request in parallel with change stream setup.
    // The AI backend is the slowest dependency; overlapping it with MongoDB
    // stream setup saves ~1.4s on the critical path.
    let preFetchedGreeting: Promise<Response> | undefined;
    if (!session.greetingComplete && !session.greetingText) {
      const config = backendConfig();
      preFetchedGreeting = fetch(
        `${config.base}/api/agents/${encodeURIComponent(config.agentId)}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.serviceToken ? { "Authorization": `Bearer ${config.serviceToken}` } : {}),
          },
          body: JSON.stringify({
            message: session.initialMessage,
            // Guests get a deterministic pseudo id (see synthesizeGuestContactId).
            contactId: session.contactId || synthesizeGuestContactId(session.userDetails) || undefined,
            contactName: session.contactName,
            conversationId: session.conversationId,
            userDetails: {
              id: session.contactId || "",
              name: session.contactName || "",
              email: session.userDetails.email || "",
              phone: session.userDetails.phone || "",
              role: "customer",
            },
            ghlContactId: session.contactId,
          }),
          signal: controller.signal,
          cache: "no-store",
        },
      ).then(async (response) => {
        console.log(`[Call debug] ai.prefetch.response`, {
          status: response.status,
          ok: response.ok,
        });
        if (!response.ok) {
          try {
            const body = await response.text();
            console.log(`[Call debug] ai.prefetch.error-body`, { body: body.slice(0, 500) });
          } catch {}
        }
        return response;
      });
    }

    changes = openCallChanges(session.sessionId);

    // Establish the cursor BEFORE the backlog check and before exposing readiness.
    const closeChanges = () => {
      void changes?.close().catch(() => {});
    };
    controller.signal.addEventListener("abort", closeChanges, { once: true });
    if (controller.signal.aborted) closeChanges();
    await changes.tryNext();
    controller.signal.throwIfAborted();

    const currentSession = session;
    const currentChanges = changes;
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    void writer.closed.catch(() => {
      controller.abort();
    });
    // Cancelling upstream work is NOT a transport failure. Planned rotation and
    // hang-up must close the readable normally, otherwise Next fails to pipe it.
    const abortTransport = () => {
      void writer.abort(req.signal.reason).catch(() => {});
    };
    req.signal.addEventListener("abort", abortTransport, { once: true });
    if (req.signal.aborted) abortTransport();
    const wakeup = new Wakeup();
    let processing = false;
    let rotationRequested = false;
    let terminal: { event: string; data: Record<string, unknown> } | undefined;
    const finish = (event: string, data: Record<string, unknown>) => {
      terminal ??= { event, data };
      controller.abort();
    };
    let renewal: Promise<void> | undefined;
    let renewing = false;
    let webhook: Promise<void> | undefined;

    const send = async (event: string, data: unknown) => {
      controller.signal.throwIfAborted();
      try {
        await writer.write(encodeSSE(event, data));
      } catch (error) {
        throw error;
      }
    };
    const startWebhook = () => {
      if (webhook || !currentSession.contactId || !currentSession.conversationId || currentSession.webhookSent) return;
      webhook = notifyConversation(currentSession.contactId, currentSession.conversationId, controller.signal)
        .then(async (sent) => {
          if (sent) await CallSession.updateOne({ sessionId: currentSession.sessionId }, { $set: { webhookSent: true } });
        }).catch(() => {});
    };

    // Stream keepalive and ownership renewal; this is NOT a message polling loop.
    const heartbeat = setInterval(() => {
      if (renewing || controller.signal.aborted) return;
      renewing = true;
      renewal = (async () => {
        const updated = await CallSession.findOneAndUpdate({
          sessionId: currentSession.sessionId, owner, status: "active", leaseUntil: { $gt: new Date() },
        }, { $set: { leaseUntil: new Date(Date.now() + LEASE_MS) } }, { returnDocument: "after" });
        if (!updated) {
          console.log(`[Call] session.ended`, {
            sessionId: currentSession.sessionId,
            conversationId: currentSession.conversationId,
            reason: "call-ended-externally",
            ownerLost: true,
          });
          finish("ended", { reason: "call-ended" });
          return;
        }
        if (!processing && Date.now() - updated.lastActivityAt.getTime() >= IDLE_MS) {
          console.log(`[Call] session.ended`, {
            sessionId: currentSession.sessionId,
            conversationId: currentSession.conversationId,
            reason: "idle-timeout",
            idleMs: Date.now() - updated.lastActivityAt.getTime(),
            thresholdMs: IDLE_MS,
          });
          await endSession(currentSession.sessionId);
          finish("ended", { reason: "idle-timeout" });
          return;
        }
        if (!controller.signal.aborted) await writer.write(new TextEncoder().encode(": heartbeat\n\n"));
      })().catch(() => {
        controller.abort();
      }).finally(() => { renewing = false; });
    }, 15_000);

    // Stop admitting turns early enough for the 120s upstream turn budget.
    // Rotate between turns; a bounded fallback still leaves cleanup headroom.
    const deadline = setTimeout(() => {
      rotationRequested = true;
      wakeup.notify();
    }, 170_000);
    const hardDeadline = setTimeout(() => {
      finish("reconnect", { reason: "request-duration", interrupted: processing });
    }, 280_000);

    const monitor = (async () => {
      try {
        while (!controller.signal.aborted) {
          const change = await currentChanges.next();
          if ("fullDocument" in change && change.fullDocument?.status === "ended") {
            finish("ended", { reason: "call-ended" });
            break;
          }
          wakeup.notify();
        }
      } catch {
        if (!controller.signal.aborted) {
          controller.abort(new Error("Change stream disconnected"));
        }
      }
    })();

    // All work belongs to this open response. /message only persists queue entries.
    void (async () => {
      try {
        const emitSession = () => send("session", {
          sessionId: currentSession.sessionId,
          conversationId: currentSession.conversationId ?? null,
        });
        await emitSession();

        const runTurn = async (turnId: string, message: string, greeting = false) => {
          processing = true;
          let sequence = 0;
          let audioClipsSent = 0;
          await send("status", { type: "processing", turnId });
          const callbacks = {
            onConversation: async (conversationId: string) => {
              currentSession.conversationId = conversationId;
              const saved = await CallSession.updateOne({
                sessionId: currentSession.sessionId, owner, status: "active",
              }, { $set: { conversationId } });
              if (!saved.matchedCount) {
                throw new Error("Call ownership was lost");
              }
              await emitSession();
              startWebhook();
            },
            onAudio: async (audio: string, format: string) => {
              const clipSequence = sequence++;
              audioClipsSent++;
              try {
                await send("audio", { turnId, sequence: clipSequence, audio, format });
              } catch (sendError) {
                const err = sendError instanceof Error ? sendError : new Error(String(sendError));
                console.error(`[Call] Failed to send audio clip to client`, {
                  sessionId: currentSession.sessionId,
                  conversationId: currentSession.conversationId,
                  turnId,
                  clipSequence,
                  audioClipsSent,
                  error: err.message,
                });
                throw sendError;
              }
            },
            onReply: async (text: string) => {
              if (greeting) {
                currentSession.greetingText = text;
                await CallSession.updateOne({ sessionId: currentSession.sessionId, owner }, {
                  $set: { greetingText: text },
                });
              }
            },
          };
          try {
            if (greeting && currentSession.greetingText) {
              await speakText(currentSession.greetingText, controller.signal, callbacks, currentSession.conversationId);
            } else {
              if (greeting && currentSession.conversationId) {
                throw new Error("Initial greeting was interrupted. End this call and start a new one.");
              }
              const result = await streamReply(message, {
                contactId: currentSession.contactId,
                contactName: currentSession.contactName,
                conversationId: currentSession.conversationId,
                userDetails: currentSession.userDetails,
              }, controller.signal, callbacks, greeting ? preFetchedGreeting : undefined);
              currentSession.conversationId = result.conversationId;
              if (greeting) preFetchedGreeting = undefined;
            }
            if (greeting) {
              currentSession.greetingComplete = true;
              await CallSession.updateOne({ sessionId: currentSession.sessionId, owner }, {
                $set: { greetingComplete: true },
              });
            } else {
              await CallMessage.updateOne({ sessionId: currentSession.sessionId, messageId: turnId, owner }, {
                $set: { status: "completed" }, $unset: { owner: 1 },
              });
            }
            await CallSession.updateOne({ sessionId: currentSession.sessionId, owner }, {
              $set: { lastActivityAt: new Date() },
            });
            await send("turn-complete", { turnId });
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            
            // Log detailed error context for debugging disconnections
            console.error(`[Call] Turn error`, {
              sessionId: currentSession.sessionId,
              conversationId: currentSession.conversationId,
              turnId,
              greeting,
              audioClipsSent,
              error: err.message,
              errorName: err.name,
              aborted: controller.signal.aborted,
            });
            
            if (controller.signal.aborted) throw error;
            if (greeting) throw error;
            await CallMessage.updateOne({ sessionId: currentSession.sessionId, messageId: turnId, owner }, {
              $set: { status: "failed", failureCode: "service-error" }, $unset: { owner: 1 },
            });
            await send("error", { fatal: false, turnId, message: "Carla could not answer that message. Please try again." });
            await send("turn-complete", { turnId });
          } finally {
            processing = false;
          }
        };

        if (!currentSession.greetingComplete) {
          console.log(`[Call] Starting greeting turn`, {
            sessionId: currentSession.sessionId,
            conversationId: currentSession.conversationId,
            hasGreetingText: Boolean(currentSession.greetingText),
          });
          await runTurn("greeting", currentSession.initialMessage, true);
          console.log(`[Call] Greeting turn completed`, {
            sessionId: currentSession.sessionId,
            conversationId: currentSession.conversationId,
            greetingComplete: currentSession.greetingComplete,
          });
        }
        await emitSession();
        startWebhook();
        let readySent = false;

        while (!controller.signal.aborted) {
          if (rotationRequested) {
            terminal = { event: "reconnect", data: { reason: "request-duration" } };
            break;
          }
          // Drain first, then sleep. Wakeup retains notifications arriving mid-turn.
          const message = await claimMessage(currentSession.sessionId, owner);
          if (controller.signal.aborted) break;
          if (message) {
            await runTurn(message.messageId, message.message);
            continue;
          }
          if (!readySent) {
            await send("ready", { sessionId: currentSession.sessionId });
            readySent = true;
          }
          await wakeup.wait(controller.signal);
        }
      } catch (streamError) {
        const err = streamError instanceof Error ? streamError : new Error(String(streamError));
        
        // Log the actual error that caused the voice cutoff
        console.error(`[Call] Stream terminated with error`, {
          sessionId: currentSession.sessionId,
          conversationId: currentSession.conversationId,
          error: err.message,
          errorName: err.name,
          errorStack: err.stack?.split('\n').slice(0, 3).join(' | '),
          aborted: controller.signal.aborted,
          greetingComplete: currentSession.greetingComplete,
          processing,
        });
        
        if (!controller.signal.aborted) {
          const restart = !currentSession.greetingComplete && !currentSession.greetingText;
          if (restart) await endSession(currentSession.sessionId).catch(() => {});
          await send("error", {
            fatal: true, restart,
            message: restart ? "The greeting was interrupted. Please start a new call." : "Call connection failed. End the call or retry the connection.",
          }).catch(() => {});
        }
      } finally {
        console.log(`[Call] Stream cleanup`, {
          sessionId: currentSession.sessionId,
          conversationId: currentSession.conversationId,
          hadTerminal: Boolean(terminal),
          terminalEvent: terminal?.event,
          requestAborted: req.signal.aborted,
        });
        clearInterval(heartbeat);
        clearTimeout(deadline);
        clearTimeout(hardDeadline);
        controller.abort();
        await currentChanges.close().catch(() => {});
        await monitor;
        if (renewal) await renewal;
        if (webhook) await webhook;
        await releaseSession(currentSession.sessionId, owner).catch(() => {});
        // Release ownership BEFORE telling the browser to open the next request.
        if (terminal && !req.signal.aborted) {
          await writer.write(encodeSSE(terminal.event, terminal.data)).catch(() => {});
        }
        await writer.close().catch(() => {});
        req.signal.removeEventListener("abort", abortRequest);
        req.signal.removeEventListener("abort", abortTransport);
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
        "X-Call-Request-Id": requestId,
      },
    });
  } catch (error) {
    req.signal.removeEventListener("abort", abortRequest);
    controller.abort();
    await changes?.close().catch(() => {});
    if (session) await releaseSession(session.sessionId, owner).catch(() => {});
    const status = error instanceof RequestError ? error.status : 503;
    const message = error instanceof RequestError ? error.message : "Unable to establish the call. Please try again.";
    
    // Log all POST errors with sessionId for debugging
    if (status >= 400) {
      console.error(`[Call] POST error response`, {
        httpStatus: status,
        message,
        sessionId: input?.sessionId ?? null,
        requestId,
        errorName: error instanceof Error ? error.name : undefined,
      });
    }
    
    return Response.json({ 
      error: message,
      sessionId: input?.sessionId ?? null,
    }, { status, headers: { "X-Call-Request-Id": requestId } });
  }
}

export async function DELETE(req: Request) {
  const requestId = randomUUID();
  try {
    const body = await readJson(req);
    const sessionId = parseSessionId(
      body && typeof body === "object" && "sessionId" in body ? body.sessionId : undefined,
    );
    await ensureCallStore();
    console.log(`[Call] DELETE session (user hangup)`, { sessionId, requestId });
    await endSession(sessionId);
    return Response.json({ success: true }, { headers: { "X-Call-Request-Id": requestId } });
  } catch (error) {
    console.error(`[Call] DELETE error`, {
      error: error instanceof Error ? error.message : "Unknown error",
      requestId,
    });
    return Response.json({ error: error instanceof RequestError ? error.message : "Unable to end the call" }, {
      status: error instanceof RequestError ? error.status : 503,
      headers: { "X-Call-Request-Id": requestId },
    });
  }
}
