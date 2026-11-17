import { describe, expect, it } from "vitest";
import { splitSpeech } from "../lib/call/protocol";

describe("splitSpeech", () => {
  it("returns short text unchanged (trimmed)", () => {
    expect(splitSpeech("  Hello there.  ")).toEqual(["Hello there."]);
  });

  it("keeps paragraphs separate", () => {
    expect(splitSpeech("First para.\n\nSecond para.")).toEqual(["First para.", "Second para."]);
  });

  it("splits long text into chunks of at most 500 chars", () => {
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const chunks = splitSpeech(long);
    expect(chunks.every((c) => c.length <= 500)).toBe(true);
    // No text is lost: rejoining (with spaces) restores the content.
    expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toBe(long.trim());
  });

  it("prefers cutting at a word boundary inside the first 501 chars", () => {
    // 502 chars; a naive cut at char 500 would split "yy" in half.
    const chunk = "x".repeat(498) + " yy";
    const out = splitSpeech(chunk);
    expect(out).toEqual(["x".repeat(498), "yy"]);
  });

  it("does not split a UTF-16 surrogate pair at the 500 boundary", () => {
    // 499 plain chars + one emoji (2 units) at positions 499-500.
    const chunk = "a".repeat(499) + "🙂" + " rest";
    const out = splitSpeech(chunk);
    // The cut must land before the surrogate pair: 499 plain chars, then the emoji stays whole.
    expect(out).toEqual(["a".repeat(499), "🙂 rest"]);
  });

  it("handles empty and whitespace-only input", () => {
    expect(splitSpeech("")).toEqual([]);
    expect(splitSpeech("\n\n  \n")).toEqual([]);
  });
});
