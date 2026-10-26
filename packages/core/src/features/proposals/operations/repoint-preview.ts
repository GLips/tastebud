/** `repoint-preview`: what `repoint` would propose, written nowhere. */
import { Effect, Schema } from "effect";

import { scopePlacesOf } from "#core/domains/places/index.ts";
import { derivationStateOf } from "#core/domains/record-snapshot/index.ts";
import { DerivationSummarySchema, summarizeDerivation } from "#core/domains/record-views/index.ts";

import {
  planRepointRevisions,
  RepointAlreadyPendingSchema,
  RepointBlockedSchema,
  type RepointPlaceInput,
} from "./repoint.ts";

/** What `repoint` would do, written nowhere. */
export const RepointPreviewResultSchema = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  revisions: Schema.Array(
    Schema.Struct({
      supersedes: DerivationSummarySchema,
      /** The scope's other places, which the revision keeps beside `to`. */
      keptPlaces: Schema.Array(Schema.String),
    }),
  ),
  alreadyPending: RepointAlreadyPendingSchema,
  blocked: Schema.Array(RepointBlockedSchema),
  /**
   * Pending proposals whose scope names `from` exactly. Repoint only revises accepted items, so
   * these keep pointing at the old place until someone edits them in review.
   */
  pendingAtFrom: Schema.Array(DerivationSummarySchema),
});
/** `repoint-preview`: the revisions `repoint` would propose, the ones already pending, and the blocked. */
export type RepointPreviewResult = typeof RepointPreviewResultSchema.Type;

/** `repoint-preview`: the revisions `repoint` would propose, the ones already pending, and the blocked. */
export const previewTastePlaceRepoint = Effect.fn("proposals.previewTastePlaceRepoint")(function* (
  input: RepointPlaceInput,
) {
  const plan = yield* planRepointRevisions(input);
  const { snapshot } = plan.view;
  const pendingAtFrom = snapshot.derivations.filter((derivation) => {
    const state = derivationStateOf(snapshot, derivation);
    return state.status === "pending" && scopePlacesOf(state.effectiveScope).includes(plan.from);
  });
  const result: RepointPreviewResult = {
    from: plan.from,
    to: plan.to,
    revisions: plan.revisions.map((planned) => ({
      supersedes: summarizeDerivation(plan.view, planned.target),
      keptPlaces: [...planned.keptPlaces],
    })),
    alreadyPending: plan.alreadyPending,
    blocked: plan.blocked,
    pendingAtFrom: pendingAtFrom.map((derivation) => summarizeDerivation(plan.view, derivation)),
  };
  return result;
});
