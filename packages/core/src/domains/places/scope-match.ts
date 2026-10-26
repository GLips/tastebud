/** Scopes: where a derivation applies, how two scopes overlap, and whether one reaches a context. */
import { Schema } from "effect";

import { formatPlaceLabel, placeCovers, type PlaceKey } from "./place-keys.ts";

/** Where a derivation may apply: `global`, or a non-empty list of places. */
export const DerivationScopeSchema = Schema.Union([
  Schema.Struct({ scope: Schema.Literal("global") }),
  Schema.Struct({ scope: Schema.Literal("places"), places: Schema.Array(Schema.String).check(Schema.isMinLength(1)) }),
]);
export type DerivationScope = typeof DerivationScopeSchema.Type;

/** The places of a scope; empty for global. */
export const scopePlacesOf = (scope: DerivationScope): ReadonlyArray<PlaceKey> =>
  scope.scope === "global" ? [] : scope.places;

/** Scopes overlap when either is global, or a place of one covers a place of the other either way. */
export const scopesOverlap = (left: DerivationScope, right: DerivationScope): boolean => {
  if (left.scope === "global" || right.scope === "global") return true;
  return left.places.some((a) => right.places.some((b) => placeCovers(a, b) || placeCovers(b, a)));
};

/** The first scope place covering one of the context places, or `"global"`; undefined when ineligible. */
export const matchScopeToContext = (
  scope: DerivationScope,
  contextPlaces: ReadonlyArray<PlaceKey>,
): string | undefined => {
  if (scope.scope === "global") return "global";
  return scope.places.find((place) => contextPlaces.some((contextPlace) => placeCovers(place, contextPlace)));
};

/** Order-independent identity of a scope, for grouping. */
export const scopeGroupKey = (scope: DerivationScope): string =>
  scope.scope === "global" ? "global" : [...new Set(scope.places)].sort().join("\n");

/** `global`, or the scope's place labels. The UI shows global as an explicit warning chip. */
export const formatScopeLabel = (scope: DerivationScope): string =>
  scope.scope === "global" ? "global" : scope.places.map(formatPlaceLabel).join(", ");
