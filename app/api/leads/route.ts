import { Lead, ensureLeadStore, type LeadRecord } from "@/db/models/lead";
import { clientIp, slidingWindowLimit } from "@/lib/rate-limit";
import { readJson, RequestError } from "@/lib/call/protocol";
import { STEPS } from "@/lib/quiz-data";

const LEADS_RATE_LIMIT_MAX = 5;
const LEADS_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_TIMEOUT_MS = 5_000;
const WEBHOOK_RETRY_DELAY_MS = 10_000;

export type LeadDelivery = "delivered" | "pending" | "failed" | "skipped";

function webhookUrl(): string | null {
  const url = process.env.GHL_LEAD_WEBHOOK_URL;
  if (!url) return null;
  if (!/^https?:\/\//.test(url)) {
    console.warn("[Leads] GHL_LEAD_WEBHOOK_URL is set but not an http(s) URL; skipping CRM delivery");
    return null;
  }
  return url;
}

async function postWebhook(url: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      cache: "no-store",
    });
    return response.ok;
  } catch (error) {
    console.warn("[Leads] GHL webhook request failed", { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

async function deliverLeadWebhook(leadId: string, payload: Record<string, unknown>): Promise<LeadDelivery> {
  const url = webhookUrl();
  if (!url) {
    console.log("[Leads] GHL_LEAD_WEBHOOK_URL not set; skipping CRM delivery", { leadId });
    return "skipped";
  }
  if (await postWebhook(url, payload)) {
    console.log("[Leads] delivered to GHL webhook", { leadId });
    return "delivered";
  }
  // At-least-once: one background retry after a short delay. The response is
  // already sent, so the timer must not keep the server alive on its own.
  console.warn("[Leads] GHL webhook delivery failed; scheduling one background retry", { leadId });
  const timer = setTimeout(() => {
    void (async () => {
      const ok = await postWebhook(url, payload);
      if (ok) console.log("[Leads] GHL webhook delivered on retry", { leadId });
      else console.error("[Leads] GHL webhook delivery failed after retry; lead stored locally only", { leadId });
    })();
  }, WEBHOOK_RETRY_DELAY_MS);
  (timer as { unref?: () => void }).unref?.();
  return "pending";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function text(value: unknown, key: string, max: number): string {
  if (typeof value !== "string" || value.length > max) throw new RequestError(400, `Invalid ${key}`);
  return value.trim();
}

function validateFirstName(raw: unknown): string {
  const firstName = text(raw, "firstName", 100);
  if (firstName.length < 2 || firstName.length > 100) throw new RequestError(400, "Invalid firstName");
  return firstName;
}

function validateLastName(raw: unknown): string {
  const lastName = text(raw, "lastName", 100);
  if (lastName.length < 2 || lastName.length > 100) throw new RequestError(400, "Invalid lastName");
  return lastName;
}

/** Returns the canonical digit form used for storage and duplicate matching. */
function validatePhone(raw: unknown): string {
  const phone = text(raw, "phone", 20);
  if (!/^(?:\+44\d{8,14}|0\d{9,10}|\d{10,11})$/.test(phone)) throw new RequestError(400, "Invalid phone");
  let digits = phone.startsWith("+") ? phone.slice(1) : phone;
  if (digits.startsWith("0")) digits = `44${digits.slice(1)}`;
  return digits;
}

function validateEmail(raw: unknown): string {
  const email = text(raw, "email", 254).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new RequestError(400, "Invalid email");
  return email;
}

function validatePostcode(raw: unknown): string {
  const postcode = text(raw, "postcode", 16).toUpperCase().replace(/\s+/g, " ");
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/.test(postcode)) throw new RequestError(400, "Invalid postcode");
  const compact = postcode.replace(/\s/g, "");
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

function validateContactMethod(raw: unknown): "phone" | "email" {
  if (raw !== "phone" && raw !== "email") throw new RequestError(400, "Invalid contactMethod");
  return raw;
}

const ANSWER_KEYS = [
  "first_time", "protection_for", "priority", "alarm",
  "alone_time", "fall_worry", "discreet", "contact_preference",
] as const;

function validateAnswers(raw: unknown): Record<(typeof ANSWER_KEYS)[number], string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new RequestError(400, "Invalid answers");
  const body = raw as Record<string, unknown>;
  const allowed: Record<string, string[]> = {};
  for (const step of STEPS) {
    if (step.options) allowed[step.key] = step.options.map((option) => option.value);
  }
  const answers = {} as Record<(typeof ANSWER_KEYS)[number], string>;
  for (const key of ANSWER_KEYS) {
    const value = body[key];
    if (typeof value !== "string" || !allowed[key]?.includes(value)) {
      throw new RequestError(400, `Invalid answer: ${key}`);
    }
    answers[key] = value;
  }
  return answers;
}

function toModelAnswers(answers: Record<(typeof ANSWER_KEYS)[number], string>): Pick<
  LeadRecord,
  | "firstTime"
  | "protectionFor"
  | "priority"
  | "alarm"
  | "aloneTime"
  | "fallWorry"
  | "discreet"
  | "contactPreference"
> {
  return {
    firstTime: answers.first_time,
    protectionFor: answers.protection_for,
    priority: answers.priority,
    alarm: answers.alarm,
    aloneTime: answers.alone_time,
    fallWorry: answers.fall_worry,
    discreet: answers.discreet,
    contactPreference: answers.contact_preference,
  };
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limit = slidingWindowLimit(`leads:${ip}`, LEADS_RATE_LIMIT_MAX, LEADS_RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let firstName = "";
  let lastName = "";
  let phone = "";
  let email = "";
  let postcode = "";
  let contactMethod: "phone" | "email";
  let answers: Record<(typeof ANSWER_KEYS)[number], string>;

  try {
    const body = (await readJson(request)) as Record<string, unknown>;
    firstName = validateFirstName(body.firstName);
    lastName = validateLastName(body.lastName);
    phone = validatePhone(body.phone);
    email = validateEmail(body.email);
    postcode = validatePostcode(body.postcode);
    contactMethod = validateContactMethod(body.contactMethod);
    answers = validateAnswers(body.answers);

    await ensureLeadStore();

    const duplicateSince = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const existing = await Lead.findOne({ email, phone }).sort({ createdAt: -1 }).lean();
    if (existing && existing.createdAt >= duplicateSince) {
      console.log("[Leads] duplicate submission within 24h; skipping insert and CRM delivery", { leadId: String(existing._id), ip });
      return Response.json({ success: true, duplicate: true, delivery: "skipped" }, { status: 200 });
    }

    const created = await Lead.create({ firstName, lastName, phone, email, postcode, contactMethod, ...toModelAnswers(answers) });
    const leadId = String(created._id);
    const payload: Record<string, string> = {
      ...answers,
      firstName,
      lastName,
      phone,
      email,
      postcode,
      contact_method: contactMethod,
      source: "guardian1st",
    };
    const delivery = await deliverLeadWebhook(leadId, payload);
    return Response.json({ success: true, duplicate: false, delivery }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestError) {
      console.warn(`[Leads] rejected request from ${ip}`, { status: error.status, reason: error.message });
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[Leads] failed to save lead", { firstName: Boolean(firstName), lastName: Boolean(lastName), email: Boolean(email) });
    return Response.json(
      { error: "Something went wrong saving your request. Please try again later." },
      { status: 503 },
    );
  }
}
