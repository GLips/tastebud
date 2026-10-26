/**
 * The scope fields operations take: `scope: "global" | "places"` plus `places`, the same shape the
 * Derivation record stores. `propose`, `decide`, `accept-preview` and `revise-scope` all read it here.
 */
import { Effect, Result, Schema } from "effect";

import { canonicalPlaceKey, type DerivationScope, type PlaceKey } from "#core/domains/places/index.ts";
import { OptionalTrimmedTextList } from "#core/shared/input-text.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

export const ScopeChoiceSchema = Schema.Literals(["global", "places"]);

export const ScopeOverrideFields = {
  scope: Schema.optionalKey(ScopeChoiceSchema).annotate({
    description: 'An explicit scope: "global", or "places" with `places`',
  }),
  places: OptionalTrimmedTextList.annotate({ description: 'The place keys, when scope is "places"' }),
};

/** Canonical place keys from caller input, `~/` under `home`, each problem naming `field`. */
export const canonicalInputPlaces = (field: string, keys: ReadonlyArray<string>, home: string) => {
  const problems: Array<string> = [];
  const places: Array<PlaceKey> = [];
  for (const key of keys) {
    const canonical = canonicalPlaceKey(key, { home });
    if (Result.isFailure(canonical)) problems.push(`${field}: "${key}": ${canonical.failure}`);
    else places.push(canonical.success);
  }
  return problems.length > 0 ? Effect.fail(new InvalidTasteInput({ problems })) : Effect.succeed([...new Set(places)]);
};

/** A complete scope from `scope` and `places`, places canonical with `~/` under `home`. */
export const readChosenScope = Effect.fn("derivation-scope.readChosenScope")(function* (
  scope: "global" | "places",
  places: ReadonlyArray<string> | undefined,
  home: string,
) {
  if (scope === "global") {
    if (places !== undefined)
      return yield* new InvalidTasteInput({ problems: ["places: a global scope has no places"] });
    const chosen: DerivationScope = { scope: "global" };
    return chosen;
  }
  if (places === undefined)
    return yield* new InvalidTasteInput({ problems: ["places: required and non-empty when scope is places"] });
  const chosen: DerivationScope = { scope: "places", places: yield* canonicalInputPlaces("places", places, home) };
  return chosen;
});

/** A complete scope from input, or undefined when it names none. */
export const readScopeOverride = Effect.fn("derivation-scope.readScopeOverride")(function* (
  input: {
    readonly scope?: "global" | "places" | undefined;
    readonly places?: ReadonlyArray<string> | undefined;
  },
  home: string,
) {
  if (input.scope !== undefined) return yield* readChosenScope(input.scope, input.places, home);
  if (input.places !== undefined)
    return yield* new InvalidTasteInput({ problems: ['places: give scope: "places" along with them'] });
  return undefined;
});
