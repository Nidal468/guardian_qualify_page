/**
 * Detects when browser speech recognition transcribes Carla's own speaker
 * output and tries to submit it back as user speech.
 */

export function normalizeSpeechForEchoCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b1st\b/g, "first")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordBigrams(words: string[]): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    grams.add(`${words[i]} ${words[i + 1]}`);
  }
  return grams;
}

/**
 * Returns true when `transcript` is almost certainly speaker echo from one of
 * the agent's recent spoken turns rather than genuine user speech.
 */
export function isLikelyAgentEcho(transcript: string, recentAgentReplies: readonly string[]): boolean {
  const normUser = normalizeSpeechForEchoCheck(transcript);
  if (!normUser || recentAgentReplies.length === 0) return false;

  // Signature phrase from Guardian 1st's own opening disclosure.
  if (
    normUser.includes("this call is recorded") ||
    (normUser.includes("carla") && normUser.includes("guardian"))
  ) {
    return true;
  }

  const userWords = normUser.split(" ");
  const userBigrams = userWords.length >= 2 ? wordBigrams(userWords) : null;

  for (const reply of recentAgentReplies) {
    const normAgent = normalizeSpeechForEchoCheck(reply);
    if (!normAgent) continue;

    // Verbatim multi-word echo (>= 5 words, e.g. "or is it just you", "let me check whats available for you").
    if (userWords.length >= 5 && normAgent.includes(normUser)) {
      return true;
    }

    // Long echo with minor ASR typos or a trailing "yes"/"okay" (>= 8 words and >= 65% bigram match).
    if (userWords.length >= 8 && userBigrams && userBigrams.size > 0) {
      const agentBigrams = wordBigrams(normAgent.split(" "));
      let hits = 0;
      for (const bg of userBigrams) {
        if (agentBigrams.has(bg)) hits++;
      }
      if (hits / userBigrams.size >= 0.65) {
        return true;
      }
    }
  }

  return false;
}
