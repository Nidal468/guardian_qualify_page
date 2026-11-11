import mongoose, { Schema, type Model } from "mongoose";
import { randomUUID } from "node:crypto";
import connectMongo from "@/db/mongoose";
import { RequestError, type CallInput, type MessageInput, type UserDetails } from "./protocol";

export const LEASE_MS = 45_000;
export const IDLE_MS = 120_000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export interface SessionRecord {
  sessionId: string;
  conversationId?: string;
  contactId?: string;
  contactName?: string;
  userDetails: UserDetails;
  initialMessage: string;
  greetingText?: string;
  greetingComplete: boolean;
  webhookSent: boolean;
  status: "active" | "ended";
  owner?: string;
  leaseUntil?: Date;
  lastActivityAt: Date;
  expiresAt: Date;
}

export interface MessageRecord {
  sessionId: string;
  conversationId: string;
  messageId: string;
  message: string;
  status: "pending" | "processing" | "completed" | "failed";
  owner?: string;
  failureCode?: string;
  createdAt: Date;
  expiresAt: Date;
}

const detailsSchema = new Schema<UserDetails>({
  email: String, phone: String, firstName: String, lastName: String,
}, { _id: false });

const sessionSchema = new Schema<SessionRecord>({
  sessionId: { type: String, required: true },
  conversationId: String,
  contactId: String,
  contactName: String,
  userDetails: { type: detailsSchema, required: true },
  initialMessage: { type: String, required: true },
  greetingText: String,
  greetingComplete: { type: Boolean, default: false },
  webhookSent: { type: Boolean, default: false },
  status: { type: String, enum: ["active", "ended"], default: "active" },
  owner: String,
  leaseUntil: Date,
  lastActivityAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false, collection: "call_sessions" });
sessionSchema.index({ sessionId: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const messageSchema = new Schema<MessageRecord>({
  sessionId: { type: String, required: true },
  conversationId: { type: String, required: true },
  messageId: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ["pending", "processing", "completed", "failed"], default: "pending" },
  owner: String,
  failureCode: String,
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false, collection: "call_messages" });
messageSchema.index({ sessionId: 1, messageId: 1 }, { unique: true });
messageSchema.index({ sessionId: 1, status: 1, createdAt: 1, _id: 1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CallSession = (mongoose.models.CallSession as Model<SessionRecord> | undefined)
  ?? mongoose.model<SessionRecord>("CallSession", sessionSchema);
export const CallMessage = (mongoose.models.CallMessage as Model<MessageRecord> | undefined)
  ?? mongoose.model<MessageRecord>("CallMessage", messageSchema);

let storeReady: Promise<void> | undefined;

async function initializeStore(): Promise<void> {
  const startedAt = Date.now();
  const connectStart = Date.now();
  await connectMongo();
  const connectMs = Date.now() - connectStart;
  const helloStart = Date.now();
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  const helloMs = Date.now() - helloStart;
  if (!hello.setName && hello.msg !== "isdbgrid") {
    throw new RequestError(503, "MongoDB must support change streams (replica set or sharded cluster)");
  }
  const collectionsStart = Date.now();
  await Promise.all([CallSession.createCollection(), CallMessage.createCollection()]);
  const collectionsMs = Date.now() - collectionsStart;
  const indexesStart = Date.now();
  await Promise.all([CallSession.createIndexes(), CallMessage.createIndexes()]);
  const indexesMs = Date.now() - indexesStart;
  console.log(`[Call perf] store.init`, { totalMs: Date.now() - startedAt, connectMs, helloMs, collectionsMs, indexesMs });
}

export async function ensureCallStore(): Promise<void> {
  if (!storeReady) {
    storeReady = initializeStore().catch((error: unknown) => {
      storeReady = undefined;
      throw error;
    });
  }
  await storeReady;
}

/**
 * Pre-warm the MongoDB connection and schema setup at module load time.
 * This ensures the first request doesn't pay the full connection cost.
 * Safe to call multiple times - subsequent calls are no-ops.
 */
export function warmCallStore(): void {
  if (!storeReady) {
    // Fire and forget - errors will be caught by ensureCallStore on first request
    storeReady = initializeStore().catch((error: unknown) => {
      storeReady = undefined;
    });
  }
}

export async function acquireSession(input: CallInput, owner: string) {
  const startedAt = Date.now();
  const now = new Date();
  if (!input.sessionId) {
    const session = await CallSession.create({
      sessionId: randomUUID(),
      initialMessage: input.message,
      contactId: input.contactId,
      contactName: input.contactName,
      userDetails: input.userDetails,
      status: "active",
      owner,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + RETENTION_MS),
    });
    console.log(`[Call perf] session.create`, { ms: Date.now() - startedAt });
    return session;
  }

  const session = await CallSession.findOneAndUpdate({
    sessionId: input.sessionId,
    status: "active",
    expiresAt: { $gt: now },
    $or: [{ owner: { $exists: false } }, { leaseUntil: { $lte: now } }],
  }, {
    $set: { owner, leaseUntil: new Date(now.getTime() + LEASE_MS), lastActivityAt: now },
  }, { returnDocument: "after" });
  if (!session) {
    // Detailed diagnostic: find out WHY the session couldn't be claimed
    const [activeExists, endedExists, expiredExists] = await Promise.all([
      CallSession.exists({ sessionId: input.sessionId, status: "active", expiresAt: { $gt: now } }),
      CallSession.exists({ sessionId: input.sessionId, status: "ended" }),
      CallSession.exists({ sessionId: input.sessionId, expiresAt: { $lte: now } }),
    ]);
    
    let reason: string;
    let status: number;
    if (activeExists) {
      reason = "already-owned-by-other";
      status = 409;
    } else if (endedExists) {
      reason = "session-explicitly-ended";
      status = 410;
    } else if (expiredExists) {
      reason = "session-expired";
      status = 410;
    } else {
      reason = "session-not-found";
      status = 410;
    }
    
    console.error(`[Call] session.acquire.failed`, {
      sessionId: input.sessionId,
      reason,
      httpStatus: status,
      activeExists,
      endedExists,
      expiredExists,
      requesterOwner: owner,
    });
    
    throw new RequestError(status, activeExists ? "This call already has an active connection" : `Call session has ended (${reason})`);
  }
  console.log(`[Call perf] session.claim`, { ms: Date.now() - startedAt, sessionId: session.sessionId });

  // Never automatically repeat a non-idempotent AI turn after its worker dies.
  await CallMessage.updateMany({
    sessionId: session.sessionId, status: "processing", owner: { $ne: owner },
  }, { $set: { status: "failed", failureCode: "interrupted" }, $unset: { owner: 1 } });
  return session;
}

export async function enqueueMessage(input: MessageInput): Promise<{ duplicate: boolean; status: string }> {
  // One network round-trip wave for independent checks, then one durable insert.
  // Validation and activity renewal share an atomic, fully filtered update.
  const now = new Date();
  const [session, existing, count] = await Promise.all([
    CallSession.updateOne({
      sessionId: input.sessionId, conversationId: input.conversationId,
      status: "active", expiresAt: { $gt: now },
    }, { $max: { lastActivityAt: now } }),
    CallMessage.findOne({ sessionId: input.sessionId, messageId: input.messageId })
      .select({ message: 1, conversationId: 1, status: 1 }).lean(),
    CallMessage.countDocuments({ sessionId: input.sessionId, status: { $in: ["pending", "processing"] } }),
  ]);
  if (!session.matchedCount) throw new RequestError(410, "Call session is unavailable");

  if (existing) {
    if (existing.message !== input.message || existing.conversationId !== input.conversationId) {
      throw new RequestError(409, "messageId was already used for another message");
    }
    return { duplicate: true, status: existing.status };
  }
  // Advisory overload guard; uniqueness is enforced by the compound DB index.
  if (count >= 20) throw new RequestError(429, "Too many pending messages");

  try {
    await CallMessage.create({
      ...input, status: "pending", createdAt: new Date(),
      expiresAt: new Date(Date.now() + RETENTION_MS),
    });
    return { duplicate: false, status: "pending" };
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) throw error;
    const saved = await CallMessage.findOne({ sessionId: input.sessionId, messageId: input.messageId }).lean();
    if (!saved || saved.message !== input.message || saved.conversationId !== input.conversationId) {
      throw new RequestError(409, "messageId was already used for another message");
    }
    return { duplicate: true, status: saved.status };
  }
}

export async function claimMessage(sessionId: string, owner: string) {
  const owned = await CallSession.exists({
    sessionId, owner, status: "active", leaseUntil: { $gt: new Date() },
  });
  if (!owned) throw new Error("Call ownership was lost");
  return CallMessage.findOneAndUpdate({ sessionId, status: "pending" }, {
    $set: { status: "processing", owner },
  }, { sort: { createdAt: 1, _id: 1 }, returnDocument: "after" });
}

export function openCallChanges(sessionId: string) {
  // A database-level watcher sees both inserted messages and remote hang-up.
  // It is notification-only: pending documents remain the durable source of truth.
  return mongoose.connection.db!.watch([
    { $match: {
      "ns.coll": { $in: ["call_messages", "call_sessions"] },
      operationType: { $in: ["insert", "update", "replace"] },
      "fullDocument.sessionId": sessionId,
    } },
  ], { fullDocument: "updateLookup", maxAwaitTimeMS: 1_000 });
}

export async function endSession(sessionId: string) {
  await CallSession.updateOne({ sessionId }, { $set: { status: "ended" } });
  await CallMessage.updateMany({ sessionId, status: "pending" }, {
    $set: { status: "failed", failureCode: "call-ended" },
  });
}

export async function releaseSession(sessionId: string, owner: string) {
  await CallMessage.updateMany({ sessionId, owner, status: "processing" }, {
    $set: { status: "failed", failureCode: "interrupted" }, $unset: { owner: 1 },
  });
  await CallSession.updateOne({ sessionId, owner }, { $unset: { owner: 1, leaseUntil: 1 } });
}