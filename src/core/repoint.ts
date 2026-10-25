/**
 * `repoint --from A --to B`: proposes a pending revision for each accepted derivation whose
 * effective scope contains exactly A, with only A replaced. It only proposes, so agents may call it;
 * each revision needs normal ratification, and the accept re-runs the repeat check.
 */
import { homedir } from "node:os";

import { Effect, Schema } from "effect";

import { TrimmedText } from "../shared/input-text.ts";
import { scopeGroupKey, scopePlacesOf } from "../shared/places.ts";
import { canonicalInputPlaces } from "./caller.ts";
import { findDerivedKind } from "./catalog.ts";
import { InvalidTasteInput } from "./errors.ts";
import { formatLocalIsoTime, newRecordId } from "./ids.ts";
import { type DerivationRecord, proposedScopeOf, SCHEMA_VERSION } from "./records.ts";
import { derivationStateOf, TasteStore } from "./store.ts";
import { DerivationSummarySchema } from "./view-schemas.ts";
import { summarizeDerivation, type ViewSource } from "./views.ts";

const REPOINT_ACTOR = "process:repoint";

export const RepointPlaceInput = Schema.Struct({
  from: TrimmedText.annotate({ description: "The exact scope place to replace" }),
  to: TrimmedText.annotate({ description: "The place to put in its stead" }),
});
export type RepointPlaceInput = typeof RepointPlaceInput.Type;

export const RepointPlaceResultSchema = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  proposals: Schema.Array(
    Schema.Struct({ supersedes: DerivationSummarySchema, revision: DerivationSummarySchema, path: Schema.String }),
  ),
  /** Accepted derivations with A whose identical revision is already pending. */
  alreadyPending: Schema.Array(DerivationSummarySchema),
});
export type RepointPlaceResult = typeof RepointPlaceResultSchema.Type;

export const repointTastePlace = Effect.fn("taste.repointTastePlace")(function* (input: RepointPlaceInput) {
  const store = yield* TasteStore;
  // canonicalInputPlaces de-duplicates, so a missing `to` means both spell the same place.
  const [from, to] = yield* canonicalInputPlaces("from/to", [input.from, input.to], homedir());
  if (from === undefined || to === undefined)
    return yield* new InvalidTasteInput({ problems: ["from and to must be different places"] });
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog: store.config.catalog };
  const targets = snapshot.derivations.filter((derivation) => {
    const state = derivationStateOf(snapshot, derivation);
    return (
      state.status === "accepted" &&
      findDerivedKind(store.config.catalog, derivation.kind) !== undefined &&
      scopePlacesOf(state.effectiveScope).includes(from)
    );
  });

  const proposals: Array<RepointPlaceResult["proposals"][number]> = [];
  const alreadyPending: Array<RepointPlaceResult["alreadyPending"][number]> = [];
  for (const target of targets) {
    const places = [
      ...new Set(
        scopePlacesOf(derivationStateOf(snapshot, target).effectiveScope).map((place) => (place === from ? to : place)),
      ),
    ];
    const scopeKey = scopeGroupKey({ scope: "places", places });
    const pendingTwin = snapshot.derivations.some(
      (other) =>
        other.supersedes === target.id &&
        derivationStateOf(snapshot, other).status === "pending" &&
        scopeGroupKey(proposedScopeOf(other)) === scopeKey,
    );
    if (pendingTwin) {
      alreadyPending.push(summarizeDerivation(view, target));
      continue;
    }
    const revision: DerivationRecord = {
      id: newRecordId(),
      type: "Derivation",
      schema_version: SCHEMA_VERSION,
      kind: target.kind,
      statement: target.statement,
      scope: "places",
      places,
      scope_source: "explicit",
      ...(target.subject !== undefined && { subject: target.subject }),
      supports: target.supports,
      ...(target.contradicts !== undefined && { contradicts: target.contradicts }),
      supersedes: target.id,
      proposed_by: REPOINT_ACTOR,
      proposed_at: formatLocalIsoTime(new Date()),
      reasoning: `Repointed from ${from} to ${to}; the statement is unchanged.`,
    };
    const written = yield* store.write(revision);
    const after: ViewSource = { snapshot: yield* store.snapshot, catalog: store.config.catalog };
    proposals.push({
      supersedes: summarizeDerivation(after, target),
      revision: summarizeDerivation(after, revision),
      path: written.path,
    });
  }
  const result: RepointPlaceResult = { from, to, proposals, alreadyPending };
  return result;
});
