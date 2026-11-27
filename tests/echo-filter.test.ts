import { describe, expect, it } from "vitest";
import { isLikelyAgentEcho, normalizeSpeechForEchoCheck } from "../lib/call/echo-filter";

describe("echo-filter", () => {
  const greeting =
    "Hi Ben, it's Carla from Guardian 1st. I'm an AI assistant and this call is recorded for training and quality. All good to carry on?";

  it("catches verbatim multi-word speaker echoes from recent agent turns", () => {
    expect(
      isLikelyAgentEcho("quick heads up this call is recorded for training and quality all good to carry on", [
        "Quick heads up — this call is recorded for training and quality. All good to carry on?",
      ]),
    ).toBe(true);
    expect(isLikelyAgentEcho("let me check whats available for you", ["Sure, let me check what's available for you."])).toBe(
      true,
    );
    expect(
      isLikelyAgentEcho("or is it just you", [
        "Got it, and is anyone else living there with you who'd be part of the decision, or is it just you?",
      ]),
    ).toBe(true);
    expect(isLikelyAgentEcho("exactly right for the advisor", ["That's exactly right for the advisor."])).toBe(true);
  });

  it("catches long ASR-corrupted echoes and signature self-intros", () => {
    expect(
      isLikelyAgentEcho(
        "hi ben its carla from guardian first im an ais assistant and this call is recorded for training and quality all good to carry on yes",
        [greeting],
      ),
    ).toBe(true);
  });

  it("allows genuine user replies and short confirmations", () => {
    expect(isLikelyAgentEcho("Yes", [greeting])).toBe(false);
    expect(isLikelyAgentEcho("Yes, all good", [greeting])).toBe(false);
    expect(isLikelyAgentEcho("Just me and my partner", ["And how many of you live at the property?"])).toBe(false);
    expect(
      isLikelyAgentEcho("Tuesday at 10am works for me", ["We have Tuesday at 10am or Wednesday at 2pm available."]),
    ).toBe(false);
    expect(isLikelyAgentEcho("How much does it cost?", [greeting])).toBe(false);
  });

  it("normalizes punctuation and 1st/first consistently", () => {
    expect(normalizeSpeechForEchoCheck("Guardian 1st — hello!")).toBe("guardian first hello");
  });
});
