/**
 * The scope fields operations take: `scope: "global" | "places"` plus `places`, the same shape the
 * Derivation record stores. `propose`, `decide`, `accept-preview` and `revise-scope` all read it here.
 */
import { homedir } from "node:os";

import { Effect, Schema } from "effect";

import { OptionalTrimmedTextList } from "../shared/input-text.ts";
import type { DerivationScope } from "../shared/places.ts";
import { canonicalInputPlaces } from "./caller.ts";
import { InvalidTasteInput } from "./errors.ts";

export const ScopeChoiceSchema = Schema.Literals(["global", "places"]);

export const ScopeOverrideFields = {
  scope: Schema.optionalKey(ScopeChoiceSchema).annotate({
    description: 'An explicit scope: "global", or "places" with `places`',
  }),
  places: OptionalTrimmedTextList.annotate({ description: 'The place keys, when scope is "places"' }),
};

/** A complete scope from `scope` and `places`, places canonical. */
export const readChosenScope = Effect.fn("taste.readChosenScope")(function* (
  scope: "global" | "places",
  places: ReadonlyArray<string> | undefined,
) {
  if (scope === "global") {
    if (places !== undefined)
      return yield* new InvalidTasteInput({ problems: ["places: a global scope has no places"] });
    const chosen: DerivationScope = { scope: "global" };
    return chosen;
  }
  if (places === undefined)
    return yield* new InvalidTasteInput({ problems: ["places: required and non-empty when scope is places"] });
  const chosen: DerivationScope = { scope: "places", places: yield* canonicalInputPlaces("places", places, homedir()) };
  return chosen;
});

/** A complete scope from input, or undefined when it names none. */
export const readScopeOverride = Effect.fn("taste.readScopeOverride")(function* (input: {
  readonly scope?: "global" | "places" | undefined;
  readonly places?: ReadonlyArray<string> | undefined;
}) {
  if (input.scope !== undefined) return yield* readChosenScope(input.scope, input.places);
  if (input.places !== undefined)
    return yield* new InvalidTasteInput({ problems: ['places: give scope: "places" along with them'] });
  return undefined;
});
