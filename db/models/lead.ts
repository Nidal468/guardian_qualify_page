import mongoose, { Schema, type Model } from "mongoose";

export type ContactMethod = "phone" | "email";

export interface LeadRecord {
  name: string;
  phone: string;
  email: string;
  postcode: string;
  contactMethod: ContactMethod;
  firstTime: string;
  protectionFor: string;
  priority: string;
  alarm: string;
  aloneTime: string;
  fallWorry: string;
  discreet: string;
  contactPreference: string;
  createdAt: Date;
  updatedAt: Date;
}

const leadSchema = new Schema<LeadRecord>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    postcode: { type: String, required: true, uppercase: true, trim: true },
    contactMethod: { type: String, enum: ["phone", "email"], required: true },
    firstTime: { type: String, required: true },
    protectionFor: { type: String, required: true },
    priority: { type: String, required: true },
    alarm: { type: String, required: true },
    aloneTime: { type: String, required: true },
    fallWorry: { type: String, required: true },
    discreet: { type: String, required: true },
    contactPreference: { type: String, required: true },
  },
  { timestamps: true, collection: "leads" },
);

// Supports the 24h duplicate-submission lookup without over-indexing.
leadSchema.index({ email: 1, phone: 1, createdAt: -1 });

export const Lead = (mongoose.models.Lead as Model<LeadRecord> | undefined)
  ?? mongoose.model<LeadRecord>("Lead", leadSchema);

let leadStoreReady: Promise<void> | undefined;

async function initializeLeadStore(): Promise<void> {
  const { default: connectMongo } = await import("@/db/mongoose");
  await connectMongo();
  try {
    await Lead.createCollection();
  } catch {
    // Collection already exists on replica sets that disallow creation.
  }
  await Lead.createIndexes();
}

export async function ensureLeadStore(): Promise<void> {
  if (!leadStoreReady) {
    leadStoreReady = initializeLeadStore().catch((error: unknown) => {
      leadStoreReady = undefined;
      throw error;
    });
  }
  await leadStoreReady;
}
