import { describe, expect, it } from "vitest";
import {
  RequestError,
  parseCallInput,
  parseMessageInput,
  readJson,
} from "../lib/call/protocol";

const validDetails = { email: "a@b.co", phone: "+447900123456" };

describe("parseCallInput", () => {
  it("accepts a new call with message and details", () => {
    const input = parseCallInput({ message: "Please greet the user.", userDetails: validDetails });
    expect(input.sessionId).toBeUndefined();
    expect(input.message).toBe("Please greet the user.");
    expect(input.userDetails.email).toBe("a@b.co");
  });

  it("requires a message for new calls but allows empty on reconnects", () => {
    expect(() => parseCallInput({ userDetails: validDetails })).toThrow(RequestError);
    const reconnected = parseCallInput({ sessionId: "123e4567-e89b-42d3-a456-426614174000", message: "", userDetails: {} });
    expect(reconnected.message).toBe("");
  });

  it("rejects malformed sessionIds", () => {
    for (const bad of ["no-dashes", "123e4567-e89b-42d3-a456-42661417400", "123E4567-E89B-42D3-A456-426614174000".toUpperCase().replace("42D3", "CDEF")]) {
      expect(() => parseCallInput({ sessionId: bad, message: "", userDetails: {} })).toThrow(RequestError);
    }
  });

  it("enforces field length limits", () => {
    expect(() => parseCallInput({ message: "x".repeat(2_001), userDetails: {} })).toThrow(/message/);
    expect(() => parseCallInput({ contactId: "x".repeat(129), message: "hi", userDetails: {} })).toThrow(/contactId/);
  });

  it("rejects non-object bodies and wrong types", () => {
    expect(() => parseCallInput(null)).toThrow(RequestError);
    expect(() => parseCallInput([])).toThrow(RequestError);
    expect(() => parseCallInput({ message: "hi", userDetails: { email: 42 } })).toThrow(/email/);
  });

  it("trims and drops empty optional strings", () => {
    const input = parseCallInput({ message: "  hi  ", contactName: "   ", userDetails: validDetails });
    expect(input.message).toBe("hi");
    expect(input.contactName).toBeUndefined();
  });
});

describe("parseMessageInput", () => {
  const base = {
    sessionId: "123e4567-e89b-42d3-a456-426614174000",
    conversationId: "abc123",
    messageId: "m-1",
    message: "hello carla",
  };

  it("accepts a valid message", () => {
    expect(parseMessageInput(base).message).toBe("hello carla");
  });

  it("requires all fields", () => {
    for (const key of ["sessionId", "conversationId", "messageId", "message"]) {
      expect(() => parseMessageInput({ ...base, [key]: undefined })).toThrow(RequestError);
    }
  });

  it("rejects oversized messages", () => {
    expect(() => parseMessageInput({ ...base, message: "x".repeat(4_001) })).toThrow(/message/);
  });
});

describe("readJson", () => {
  it("parses a JSON body", async () => {
    const req = new Request("http://localhost/api/call", { method: "POST", body: '{"a":1}' });
    await expect(readJson(req)).resolves.toEqual({ a: 1 });
  });

  it("rejects invalid JSON with 400", async () => {
    const req = new Request("http://localhost/api/call", { method: "POST", body: "{nope" });
    await expect(readJson(req)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects oversized bodies with 413", async () => {
    const req = new Request("http://localhost/api/call", { method: "POST", body: "x".repeat(20_000) });
    await expect(readJson(req)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects requests without a body with 400", async () => {
    const req = new Request("http://localhost/api/call", { method: "POST" });
    await expect(readJson(req)).rejects.toMatchObject({ status: 400 });
  });
});
