import { readJson, RequestError } from "@/lib/call/protocol";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const email = body && typeof body === "object" && "email" in body ? body.email : undefined;
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw new RequestError(400, "A valid email is required");
    }
    const key = process.env.GHL_API_KEY;
    const location = process.env.GHL_LOCATION_ID;
    if (!key || !location) throw new RequestError(503, "Contact lookup is not available");

    const url = new URL("https://services.leadconnectorhq.com/contacts/lookup");
    url.searchParams.set("locationId", location);
    url.searchParams.set("email", email.trim().toLowerCase());
    url.searchParams.set("limit", "1");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Version: "v3" },
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(8_000)]),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("[GHL lookup] Upstream request failed", { status: response.status });
      throw new RequestError(response.status === 429 ? 429 : 502, "Contact lookup is temporarily unavailable");
    }

    const data = await response.json() as { contacts?: { id?: unknown }[] };
    const contactId = data.contacts?.[0]?.id;
    if (typeof contactId !== "string" || !contactId) {
      throw new RequestError(404, "Contact is not ready yet");
    }
    return Response.json({ contactId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: error instanceof RequestError ? error.message : "Contact lookup is temporarily unavailable",
    }, { status: error instanceof RequestError ? error.status : 502 });
  }
}