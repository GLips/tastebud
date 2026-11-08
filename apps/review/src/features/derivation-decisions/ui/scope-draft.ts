/**
 * A scope draft as the review UI uses it: the fields a decide or preview call takes, and the scope
 * as the end of a button's words. The draft's rules live in `@tastebud/core/places`.
 */
import {
  type DerivationScope,
  formatPlaceLabel,
  isCompleteScope,
  isSameScope,
  type PlaceKey,
  type ScopeDraft,
} from "@tastebud/core/places";

/** The decide/preview fields for a draft, or nothing when it matches the proposed scope. */
export const scopeOverrideOf = (
  proposed: DerivationScope,
  draft: ScopeDraft | undefined,
): { scope: "global" } | { scope: "places"; places: Array<PlaceKey> } | undefined => {
  if (draft === undefined || !isCompleteScope(draft) || isSameScope(proposed, draft)) return undefined;
  return draft.scope === "global" ? { scope: "global" } : { scope: "places", places: [...draft.places] };
};

/** The scope as the end of a button's words: "everywhere", "in acme/web", "in 3 places". */
export const scopeButtonPhrase = (
  scope: DerivationScope,
  labelOf: (place: PlaceKey) => string = formatPlaceLabel,
): string => {
  if (scope.scope === "global") return "everywhere";
  const [only] = scope.places;
  return scope.places.length === 1 && only !== undefined ? `in ${labelOf(only)}` : `in ${scope.places.length} places`;
};
