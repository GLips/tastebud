export {
  RELATED_THRESHOLD,
  REPEAT_THRESHOLD,
  normaliseText,
  normaliseTokens,
  tokenJaccard,
} from "./token-similarity.ts";
export { findRepeatMatches, formatRepeatMatchLines, supersessionLineageOf } from "./repeat-check.ts";
export type { RepeatCandidate, RepeatCheckResult } from "./repeat-check.ts";
