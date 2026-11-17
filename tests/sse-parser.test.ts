import { describe, expect, it } from "vitest";
import { SSEParser } from "../lib/call/protocol";

describe("SSEParser", () => {
  it("parses a simple event", () => {
    const parser = new SSEParser();
    const events = parser.push("event: delta\ndata: {\"text\":\"hi\"}\n\n");
    expect(events).toEqual([{ event: "delta", data: '{"text":"hi"}' }]);
  });

  it("handles fragmented frames across pushes", () => {
    const parser = new SSEParser();
    let events = parser.push("event: au");
    expect(events).toEqual([]);
    events = parser.push("dio\nda");
    expect(events).toEqual([]);
    events = parser.push("ta: abc\n\nevent: x\ndata: y\n\n");
    expect(events).toEqual([
      { event: "audio", data: "abc" },
      { event: "x", data: "y" },
    ]);
  });

  it("supports CRLF and lone CR line endings", () => {
    const crlf = new SSEParser();
    expect(crlf.push("data: one\r\ndata: two\r\n\r\n")).toEqual([{ event: "message", data: "one\ntwo" }]);
    // A trailing lone CR is ambiguous (could be a CRLF split across chunks),
    // so it is held back until finish() flushes it.
    const cr = new SSEParser();
    expect(cr.push("data: x\r\ndata: y\r")).toEqual([]);
    expect(cr.finish()).toEqual([{ event: "message", data: "x\ny" }]);
  });

  it("ignores comments and keeps trailing CR for next line", () => {
    const parser = new SSEParser();
    const events = parser.push(": keep-alive\ndata: ok\n\n");
    expect(events).toEqual([{ event: "message", data: "ok" }]);
  });

  it("joins multiline data with newlines", () => {
    const parser = new SSEParser();
    const events = parser.push("data: line1\ndata: line2\n\n");
    expect(events).toEqual([{ event: "message", data: "line1\nline2" }]);
  });

  it("emits a buffered event on finish()", () => {
    const parser = new SSEParser();
    expect(parser.push("data: tail")).toEqual([]);
    expect(parser.finish()).toEqual([{ event: "message", data: "tail" }]);
  });

  it("defaults the event name to message", () => {
    const parser = new SSEParser();
    expect(parser.push("data: plain\n\n")).toEqual([{ event: "message", data: "plain" }]);
  });

  it("throws on oversized events", () => {
    const parser = new SSEParser(64);
    expect(() => parser.push("data: " + "x".repeat(100) + "\n\n")).toThrow(/too large/);
  });

  it("strips a single leading space from field values", () => {
    const parser = new SSEParser();
    expect(parser.push("event: spaced\ndata: kept\n\n")).toEqual([{ event: "spaced", data: "kept" }]);
    // Per the SSE spec, only ONE leading space is stripped.
    const p2 = new SSEParser();
    expect(p2.push("data:  double\n\n")).toEqual([{ event: "message", data: " double" }]);
  });
});
