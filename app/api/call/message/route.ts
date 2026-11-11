import { randomUUID } from "node:crypto";
import { callErrorDetails, logCallDiagnostic } from "@/lib/call/diagnostics";
import { parseMessageInput, readJson, RequestError } from "@/lib/call/protocol";
import { enqueueMessage, ensureCallStore } from "@/lib/call/store";

export async function POST(req: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let stage = "parse-request";
  let turnId: string | undefined;
  try {
    const input = parseMessageInput(await readJson(req));
    turnId = input.messageId;
    logCallDiagnostic("server", "message.request", {
      requestId, turnId, textLength: input.message.length,
    });
    stage = "database-setup";
    const storeStart = performance.now();
    await ensureCallStore();
    stage = "enqueue-message";
    const queueStart = performance.now();
    const result = await enqueueMessage(input);
    const queueEnd = performance.now();
    logCallDiagnostic("server", "message.accepted", {
      requestId, turnId, duplicate: result.duplicate, status: result.status,
      storeMs: Math.round(queueStart - storeStart), queueMs: Math.round(queueEnd - queueStart),
      elapsedMs: Date.now() - startedAt,
    });
    return Response.json({
      accepted: true,
      messageId: input.messageId,
      ...result,
    }, {
      status: result.duplicate ? 200 : 202,
      headers: {
        "Cache-Control": "no-store",
        "X-Call-Request-Id": requestId,
        "Server-Timing": `store;dur=${(queueStart - storeStart).toFixed(1)}, queue;dur=${(queueEnd - queueStart).toFixed(1)}`,
      },
    });
  } catch (error) {
    logCallDiagnostic("server", req.signal.aborted ? "message.canceled" : "message.failed", {
      requestId, turnId, stage, elapsedMs: Date.now() - startedAt, ...callErrorDetails(error),
    }, req.signal.aborted ? "info" : "error");
    return Response.json({
      error: error instanceof RequestError ? error.message : "Unable to save the message. Please try again.",
    }, {
      status: error instanceof RequestError ? error.status : 503,
      headers: { "X-Call-Request-Id": requestId, "Cache-Control": "no-store" },
    });
  }
}