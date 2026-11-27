export interface UserDetails {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  firstName?: string;
  lastName?: string;
}

export interface CallInput {
  sessionId?: string;
  agentId?: string;
  message: string;
  contactId?: string;
  contactName?: string;
  userDetails: UserDetails;
}

export interface MessageInput {
  sessionId: string;
  conversationId: string;
  messageId: string;
  message: string;
}

export class RequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "RequestError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400, "Expected a JSON object");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, key: string, max: number, required = false): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new RequestError(400, `${key} is required`);
    return undefined;
  }
  if (typeof value !== "string" || value.length > max) {
    throw new RequestError(400, `${key} must be a string of at most ${max} characters`);
  }
  const trimmed = value.trim();
  if (!trimmed && required) throw new RequestError(400, `${key} is required`);
  return trimmed || undefined;
}

export function parseSessionId(value: unknown): string {
  const id = text(value, "sessionId", 36, true)!;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new RequestError(400, "Invalid sessionId");
  }
  return id;
}

export function parseAgentId(value: unknown): string | undefined {
  const id = text(value, "agentId", 64);
  if (!id) return undefined;
  if (!/^[0-9a-f]{24}$/i.test(id)) {
    throw new RequestError(400, "Invalid agentId");
  }
  return id;
}

export function parseCallInput(value: unknown): CallInput {
  const body = record(value);
  const details = body.userDetails === undefined ? {} : record(body.userDetails);
  return {
    sessionId: body.sessionId === undefined ? undefined : parseSessionId(body.sessionId),
    agentId: body.agentId === undefined ? undefined : parseAgentId(body.agentId),
    message: text(body.message, "message", 2_000, body.sessionId === undefined) ?? "",
    contactId: text(body.contactId, "contactId", 128),
    contactName: text(body.contactName, "contactName", 240),
    userDetails: {
      email: text(details.email, "email", 254),
      phone: text(details.phone, "phone", 50),
      firstName: text(details.firstName, "firstName", 100),
      lastName: text(details.lastName, "lastName", 100),
    },
  };
}

export function parseMessageInput(value: unknown): MessageInput {
  const body = record(value);
  return {
    sessionId: parseSessionId(body.sessionId),
    conversationId: text(body.conversationId, "conversationId", 128, true)!,
    messageId: text(body.messageId, "messageId", 64, true)!,
    message: text(body.message, "message", 4_000, true)!,
  };
}

export async function readJson(request: Request): Promise<unknown> {
  const limit = 16_384;
  if (Number(request.headers.get("content-length")) > limit) {
    throw new RequestError(413, "Request body is too large");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "Request body is required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError(413, "Request body is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new RequestError(400, "Invalid JSON");
  }
}

export interface SSEEvent {
  event: string;
  data: string;
}

/** Handles fragmented LF/CRLF/CR frames, comments, and multiline data. */
export class SSEParser {
  private buffer = "";
  private event = "";
  private data: string[] = [];
  private eventSize = 0;

  constructor(private maxSize = 16 * 1024 * 1024) {}

  push(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const events: SSEEvent[] = [];
    while (true) {
      const index = this.buffer.search(/[\r\n]/);
      if (index < 0 || (this.buffer[index] === "\r" && index === this.buffer.length - 1)) break;
      const width = this.buffer[index] === "\r" && this.buffer[index + 1] === "\n" ? 2 : 1;
      this.line(this.buffer.slice(0, index), events);
      this.buffer = this.buffer.slice(index + width);
    }
    if (this.buffer.length + this.eventSize > this.maxSize) throw new Error("SSE event is too large");
    return events;
  }

  finish(): SSEEvent[] {
    const events: SSEEvent[] = [];
    if (this.buffer) this.line(this.buffer.replace(/\r$/, ""), events);
    this.buffer = "";
    this.line("", events);
    return events;
  }

  private line(line: string, events: SSEEvent[]) {
    this.eventSize += line.length;
    if (this.eventSize > this.maxSize) throw new Error("SSE event is too large");
    if (!line) {
      if (this.data.length) events.push({ event: this.event || "message", data: this.data.join("\n") });
      this.event = "";
      this.data = [];
      this.eventSize = 0;
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.event = value;
    if (field === "data") this.data.push(value);
  }
}

export async function* readSSE(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  maxSize?: number,
): AsyncGenerator<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SSEParser(maxSize);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) {
        yield* parser.push(decoder.decode());
        yield* parser.finish();
        return;
      }
      yield* parser.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function encodeSSE(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Keep all text in order, including unpunctuated paragraphs and list items. */
export function splitSpeech(text: string): string[] {
  const chunks: string[] = [];
  for (const paragraph of text.split(/\n+/u)) {
    let remaining = paragraph.trim();
    while (remaining.length > 500) {
      const boundary = remaining.slice(0, 501).search(/\s+\S*$/u);
      let cut = boundary > 0 ? boundary : 500;
      // Do not split a UTF-16 surrogate pair in an unusually long word.
      if (cut === 500 && /[\uD800-\uDBFF]/u.test(remaining[cut - 1])) cut--;
      chunks.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) chunks.push(remaining);
  }
  return chunks;
}
