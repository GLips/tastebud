/**
 * How alike two things the owner typed are, for finding a request they repeat across sessions. Unlike
 * repeat detection's normaliser it keeps question words and negation: "where did we land" is the whole
 * request, and "don't" changes one.
 */

/** Words too common to say two requests are alike. */
const FILLER_WORDS = new Set(["a", "an", "the", "to", "of", "and", "i", "it", "is", "that", "this", "so", "ok", "w"]);

const requestWordsOf = (text: string): ReadonlySet<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}'\s]+/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 0 && !FILLER_WORDS.has(word)),
  );

/**
 * The share of the shorter text's words the longer one also has, 0 to 1. A request repeated inside a
 * longer message still scores high; a probe of under three words must match whole.
 */
export const ownerTextSimilarity = (probe: string, text: string): number => {
  const probeWords = requestWordsOf(probe);
  const words = requestWordsOf(text);
  const shorter = probeWords.size <= words.size ? probeWords : words;
  const longer = shorter === probeWords ? words : probeWords;
  if (shorter.size === 0) return 0;
  let shared = 0;
  for (const word of shorter) if (longer.has(word)) shared += 1;
  if (shorter.size < 3) return shared === shorter.size ? 1 : 0;
  return shared / shorter.size;
};

/** At or above: worth an agent's look as the same request. Retrieval only; the agent judges. */
export const SIMILAR_OWNER_TEXT_THRESHOLD = 0.6;
