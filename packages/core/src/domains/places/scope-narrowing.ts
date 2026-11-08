import { placeCovers } from "./place-keys.ts";
import type { DerivationScope } from "./scope-match.ts";

/**
 * Whether `next` only narrows `from`: every place it names is already covered by `from`. An accept
 * that narrows can't newly overlap anything `from` didn't, so the review UI sends it without a preview.
 */
export const isScopeNarrowing = (from: DerivationScope, next: DerivationScope): boolean => {
  if (from.scope === "global") return true;
  if (next.scope === "global") return false;
  return next.places.every((place) => from.places.some((covering) => placeCovers(covering, place)));
};
