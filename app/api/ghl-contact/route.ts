import { RequestError } from "@/lib/call/protocol";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get("contactId");
    if (!contactId || typeof contactId !== "string" || !/^[a-zA-Z0-9]{10,64}$/.test(contactId)) {
      throw new RequestError(400, "A valid contactId is required");
    }

    const key = process.env.GHL_API_KEY;
    if (!key) throw new RequestError(503, "Contact lookup is not available");

    const url = `https://services.leadconnectorhq.com/contacts/${contactId}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Version: "v3" },
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(8_000)]),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[GHL contact] Upstream request failed", { status: response.status });
      throw new RequestError(response.status === 404 ? 404 : 502, "Contact not found");
    }

    const data = (await response.json()) as {
      contact?: {
        firstName?: unknown;
        lastName?: unknown;
        phone?: unknown;
        email?: unknown;
      };
    };

    const c = data.contact;
    if (!c) throw new RequestError(404, "Contact not found");

    const firstName = typeof c.firstName === "string" ? c.firstName : "";
    const lastName = typeof c.lastName === "string" ? c.lastName : "";
    const phone = typeof c.phone === "string" ? c.phone : undefined;
    const email = typeof c.email === "string" ? c.email : undefined;

    if (!email) {
      throw new RequestError(404, "Contact has no email");
    }

    return Response.json({ firstName, lastName, phone, email }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof RequestError ? error.message : "Contact lookup is temporarily unavailable" },
      { status: error instanceof RequestError ? error.status : 502 },
    );
  }
}