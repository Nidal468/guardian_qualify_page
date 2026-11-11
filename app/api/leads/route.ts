import { Lead, ensureLeadStore, type LeadRecord } from "@/db/models/lead";
import { readJson, RequestError } from "@/lib/call/protocol";
import { STEPS } from "@/lib/quiz-data";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const attemptsByIp = new Map<string, number[]>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim().slice(0, 64);
  return "unknown";
}

function rateLimit(ip: string): boolean {
  if (attemptsByIp.size > 10_000) {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    for (const [key, timestamps] of attemptsByIp) {
      const fresh = timestamps.filter((ts) => ts > cutoff);
      if (fresh.length === 0) attemptsByIp.delete(key);
      else attemptsByIp.set(key, fresh);
    }
  }
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  let attempts = attemptsByIp.get(ip) ?? [];
  attempts = attempts.filter((ts) => ts > windowStart);
  if (attempts.length >= RATE_LIMIT_MAX) {
    attemptsByIp.set(ip, attempts);
    return false;
  }
  attempts.push(now);
  attemptsByIp.set(ip, attempts);
  return true;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function text(value: unknown, key: string, max: number): string {
  if (typeof value !== "string" || value.length > max) throw new RequestError(400, `Invalid ${key}`);
  return value.trim();
}

function validateName(raw: unknown): string {
  const name = text(raw, "name", 200);
  if (name.length < 2 || name.length > 100) throw new RequestError(400, "Invalid name");
  return name;
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
  if (!rateLimit(ip)) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  let name = "";
  let phone = "";
  let email = "";
  let postcode = "";
  let contactMethod: "phone" | "email";
  let answers: Record<(typeof ANSWER_KEYS)[number], string>;

  try {
    const body = (await readJson(request)) as Record<string, unknown>;
    name = validateName(body.name);
    phone = validatePhone(body.phone);
    email = validateEmail(body.email);
    postcode = validatePostcode(body.postcode);
    contactMethod = validateContactMethod(body.contactMethod);
    answers = validateAnswers(body.answers);

    await ensureLeadStore();

    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const duplicate = await Lead.exists({ email, phone, createdAt: { $gte: since } });
    if (duplicate) {
      return Response.json(
        { error: "A request with these details was already received. Our team will be in touch shortly." },
        { status: 409 },
      );
    }

    await Lead.create({ name, phone, email, postcode, contactMethod, ...toModelAnswers(answers) });
    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestError) {
      console.warn(`[Leads] rejected request from ${ip}`, { status: error.status, reason: error.message });
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[Leads] failed to save lead", { name: Boolean(name), email: Boolean(email) });
    return Response.json(
      { error: "Something went wrong saving your request. Please try again later." },
      { status: 503 },
    );
  }
}
