/** `context`: what applies here at session start. */
import { Effect, Schema } from "effect";

import { selectRecallKinds } from "#core/domains/kind-catalog/index.ts";
import { matchScopeToContext } from "#core/domains/places/index.ts";
import { derivationStateOf } from "#core/domains/record-snapshot/index.ts";
import type { ViewSource } from "#core/domains/record-views/index.ts";
import type { TasteCaller } from "#core/domains/taste-caller/index.ts";
import { resolveOperationContext } from "#core/features/place-context/index.server.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { compareIsoTimes } from "#core/shared/iso-times.ts";

import { recallFields, recallHitOf } from "./recall.ts";

export const ListContextDerivationsInput = Schema.Struct(recallFields);
export type ListContextDerivationsInput = typeof ListContextDerivationsInput.Type;

/** `context`: every accepted, eligible derivation of the selected kinds (default: inject), oldest first. */
export const listContextDerivations = Effect.fn("recall.listContextDerivations")(function* (
  input: ListContextDerivationsInput,
  caller: TasteCaller,
) {
  const store = yield* TasteStore;
  const { catalog } = store.config;
  const kinds = yield* selectRecallKinds(catalog, input.kind, ["inject"]);
  const context = yield* resolveOperationContext(input, caller);
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog };
  const derivations = kinds.flatMap((kind) =>
    snapshot.derivations.flatMap((derivation) => {
      if (derivation.kind !== kind.key) return [];
      const state = derivationStateOf(snapshot, derivation);
      const matchedPlace = matchScopeToContext(state.effectiveScope, context.places);
      return state.status === "accepted" && matchedPlace !== undefined
        ? [recallHitOf(view, derivation, kind, matchedPlace, 0)]
        : [];
    }),
  );
  return {
    context,
    kinds: kinds.map((kind) => kind.key),
    derivations: derivations.sort(
      (left, right) => compareIsoTimes(left.proposedAt, right.proposedAt) || left.id.localeCompare(right.id),
    ),
  };
});
