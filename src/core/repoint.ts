/**
 * `repoint --from A --to B`: proposes a pending revision for each accepted derivation whose
 * effective scope contains exactly A, with only A replaced. It only proposes, so agents may call it;
 * each revision meets propose's rules, needs normal ratification, and the accept re-runs the repeat
 * check. A revision the rules refuse is reported as blocked, not written.
 */
import { homedir } from "node:os";

import { Effect, Result, Schema } from "effect";

import { TrimmedText } from "../shared/input-text.ts";
import { scopeGroupKey, scopePlacesOf } from "../shared/places.ts";
import { canonicalInputPlaces } from "./caller.ts";
import { findDerivedKind } from "./catalog.ts";
import { InvalidTasteInput } from "./errors.ts";
import { stampNewRecord } from "./ids.ts";
import { checkDerivationProposal } from "./propose.ts";
import { type DerivationRecord, proposedScopeOf, SCHEMA_VERSION } from "./records.ts";
import { derivationStateOf, resolveEvidenceRef, TasteStore } from "./store.ts";
import { DerivationSummarySchema, RepeatMatchSchema } from "./view-schemas.ts";
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
  /** Accepted derivations whose revision propose's rules refused; `matches` are blocking near repeats. */
  blocked: Schema.Array(
    Schema.Struct({
      derivation: DerivationSummarySchema,
      problem: Schema.String,
      matches: Schema.Array(RepeatMatchSchema),
    }),
  ),
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
    return state.status === "accepted" && scopePlacesOf(state.effectiveScope).includes(from);
  });

  const proposals: Array<RepointPlaceResult["proposals"][number]> = [];
  const alreadyPending: Array<RepointPlaceResult["alreadyPending"][number]> = [];
  const blocked: Array<RepointPlaceResult["blocked"][number]> = [];
  for (const target of targets) {
    const kind = findDerivedKind(store.config.catalog, target.kind);
    if (kind === undefined) continue;
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
    // Each revision is checked against the store as it is now, earlier revisions included.
    const current: ViewSource = { snapshot: yield* store.snapshot, catalog: store.config.catalog };
    const checked = yield* Effect.result(
      Effect.gen(function* () {
        const evidenceOf = (ids: ReadonlyArray<string>) =>
          Effect.forEach(ids, (id) => resolveEvidenceRef(current.snapshot, id));
        return yield* checkDerivationProposal(current, kind, {
          statement: target.statement,
          scope: { scope: "places", places },
          supports: yield* evidenceOf(target.supports),
          contradicts: yield* evidenceOf(target.contradicts ?? []),
          supersedes: target,
          despite: [],
        });
      }),
    );
    if (Result.isFailure(checked)) {
      const failure = checked.failure;
      blocked.push({
        derivation: summarizeDerivation(current, target),
        problem: failure.message,
        matches: failure._tag === "NearRepeat" ? failure.matches : [],
      });
      continue;
    }
    const stamp = yield* stampNewRecord;
    const revision: DerivationRecord = {
      id: stamp.id,
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
      proposed_at: stamp.at,
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
  const result: RepointPlaceResult = { from, to, proposals, alreadyPending, blocked };
  return result;
});
