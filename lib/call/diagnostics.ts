/**
 * Metadata-only diagnostics. Never pass bodies, transcripts, audio, URLs,
 * session IDs (bearer capabilities), contact details, or raw Error objects.
 */
export type CallDebugDetails = Record<string, string | number | boolean | null | undefined>;
export type CallDebugScope = "browser" | "server";
export type CallDebugLevel = "info" | "warn" | "error";

export function callDebugEnabled(scope: CallDebugScope): boolean {
  return scope === "browser"
    ? process.env.NEXT_PUBLIC_CALL_DEBUG === "1"
    : process.env.CALL_DEBUG === "1";
}

export function logCallDiagnostic(
  scope: CallDebugScope,
  event: string,
  details: CallDebugDetails = {},
  level: CallDebugLevel = "info",
): void {
  if (!callDebugEnabled(scope)) return;
  const metadata = { ...details };
  // The public API permits arbitrary message IDs. Only log the UUIDs generated
  // by our client (and the fixed greeting ID), never arbitrary caller text.
  for (const key of ["turnId", "expectedTurnId"]) {
    const value = metadata[key];
    if (typeof value === "string" && value !== "greeting"
      && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      metadata[key] = "redacted-non-uuid";
    }
  }
  console[level](`[Call debug:${scope}] ${event}`, {
    ...metadata,
    at: new Date().toISOString(),
  });
}

// Names/codes are allowlisted: upstream errors can include credentials or PII
// in message, stack, cause, URL, or even custom name/code fields.
const errorNames = new Set([
  "Error", "TypeError", "SyntaxError", "RangeError", "DOMException", "RequestError",
  "AbortError", "TimeoutError", "NotAllowedError", "NotFoundError",
  "NotReadableError", "NotSupportedError", "InvalidStateError", "SecurityError",
  "NetworkError", "EncodingError", "MongoServerError", "MongoNetworkError",
  "MongoNetworkTimeoutError", "MongoServerSelectionError", "MongoExpiredSessionError",
  "MongoChangeStreamError", "MongoTopologyClosedError", "MongoNotConnectedError",
  "MongooseError", "ValidationError",
]);
const errorCodes = new Set([
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN",
  "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET",
]);

const errorReasons = new Map([
  ["AI_BACKEND is not configured", "backend-not-configured"],
  ["Invalid AI_BACKEND protocol", "invalid-backend-protocol"],
  ["MongoDB must support change streams (replica set or sharded cluster)", "mongo-change-streams-required"],
  ["This call already has an active connection", "session-already-owned"],
  ["Call session has ended", "session-ended"],
  ["Call session is unavailable", "session-unavailable"],
  ["Call ownership was lost", "session-ownership-lost"],
  ["Too many pending messages", "pending-message-limit"],
  ["messageId was already used for another message", "message-id-conflict"],
  ["Voice generation is temporarily unavailable", "tts-unavailable"],
  ["Voice response is too large", "tts-size-limit"],
  ["Voice generation returned empty audio", "tts-empty-audio"],
  ["The advisor service is temporarily unavailable", "ai-unavailable"],
  ["The advisor returned an invalid response", "ai-invalid-response"],
  ["Invalid conversation identifier", "ai-invalid-conversation-id"],
  ["The advisor could not complete this turn", "ai-error-event"],
  ["The advisor response is too long", "ai-text-limit"],
  ["The advisor response was interrupted", "ai-incomplete-response"],
  ["Initial greeting was interrupted. End this call and start a new one.", "greeting-interrupted"],
  ["Audio arrived out of order. Retry the connection.", "audio-out-of-order"],
  ["The call disconnected. Retry the connection to continue.", "unexpected-stream-eof"],
  ["Change stream disconnected", "mongo-change-stream-disconnected"],
]);

function errorIdentity(error: unknown): CallDebugDetails {
  if (!error || typeof error !== "object") return { errorName: "UnknownError" };
  const value = error as { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
  return {
    errorName: typeof value.name === "string" && errorNames.has(value.name) ? value.name : "OtherError",
    errorCode: typeof value.code === "number" && Number.isFinite(value.code)
      ? value.code
      : typeof value.code === "string" && errorCodes.has(value.code) ? value.code : undefined,
    errorStatus: typeof value.status === "number" && Number.isFinite(value.status) ? value.status : undefined,
    // Only exact, known application messages become fixed reason codes.
    // Unrecognized messages (including upstream/library messages) are omitted.
    errorReason: typeof value.message === "string" ? errorReasons.get(value.message) : undefined,
  };
}

export function callErrorDetails(error: unknown): CallDebugDetails {
  const details = errorIdentity(error);
  const cause = error && typeof error === "object" && "cause" in error ? error.cause : undefined;
  if (cause && typeof cause === "object") {
    const identity = errorIdentity(cause);
    details.causeName = identity.errorName;
    details.causeCode = identity.errorCode;
  }
  return details;
}