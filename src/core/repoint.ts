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
import { derivationStateOf, resolveEvidenceRef, snapshotWithUnwrittenDerivations, TasteStore } from "./store.ts";
import { DerivationSummarySchema, RepeatMatchSchema } from "./view-schemas.ts";
import { summarizeDerivation, type ViewSource } from "./views.ts";

const REPOINT_ACTOR = "process:repoint";

export const RepointPlaceInput = Schema.Struct({
  from: TrimmedText.annotate({ description: "The exact scope place to replace" }),
  to: TrimmedText.annotate({ description: "The place to put in its stead" }),
});
export type RepointPlaceInput = typeof RepointPlaceInput.Type;

const RepointBlockedSchema = Schema.Struct({
  derivation: DerivationSummarySchema,
  problem: Schema.String,
  /** Blocking near repeats, when that is why. */
  matches: Schema.Array(RepeatMatchSchema),
});

/** Accepted derivations with A whose identical revision is already pending. */
const RepointAlreadyPendingSchema = Schema.Array(DerivationSummarySchema);

export const RepointPlaceResultSchema = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  proposals: Schema.Array(
    Schema.Struct({ supersedes: DerivationSummarySchema, revision: DerivationSummarySchema, path: Schema.String }),
  ),
  alreadyPending: RepointAlreadyPendingSchema,
  /** Accepted derivations whose revision propose's rules refused. */
  blocked: Schema.Array(RepointBlockedSchema),
});
export type RepointPlaceResult = typeof RepointPlaceResultSchema.Type;

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
});
export type RepointPreviewResult = typeof RepointPreviewResultSchema.Type;

interface RepointRevisionPlan {
  readonly target: DerivationRecord;
  readonly revision: DerivationRecord;
  readonly keptPlaces: ReadonlyArray<string>;
}

/**
 * Every revision `repoint` would write, checked by propose's rules but written nowhere. Each is
 * checked against the store plus the revisions planned before it, so a batch can't repeat itself.
 */
const planRepointRevisions = Effect.fn("taste.planRepointRevisions")(function* (input: RepointPlaceInput) {
  const store = yield* TasteStore;
  const { catalog } = store.config;
  // canonicalInputPlaces de-duplicates, so a missing `to` means both spell the same place.
  const [from, to] = yield* canonicalInputPlaces("from/to", [input.from, input.to], homedir());
  if (from === undefined || to === undefined)
    return yield* new InvalidTasteInput({ problems: ["from and to must be different places"] });
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog };
  const targets = snapshot.derivations.filter((derivation) => {
    const state = derivationStateOf(snapshot, derivation);
    return state.status === "accepted" && scopePlacesOf(state.effectiveScope).includes(from);
  });

  const revisions: Array<RepointRevisionPlan> = [];
  const alreadyPending: Array<RepointPlaceResult["alreadyPending"][number]> = [];
  const blocked: Array<RepointPlaceResult["blocked"][number]> = [];
  for (const target of targets) {
    const kind = findDerivedKind(catalog, target.kind);
    if (kind === undefined) continue;
    const scopePlaces = scopePlacesOf(derivationStateOf(snapshot, target).effectiveScope);
    const keptPlaces = scopePlaces.filter((place) => place !== from);
    const places = [...new Set(scopePlaces.map((place) => (place === from ? to : place)))];
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
    const current: ViewSource = {
      snapshot: snapshotWithUnwrittenDerivations(
        snapshot,
        revisions.map((planned) => planned.revision),
      ),
      catalog,
    };
    const evidenceOf = (ids: ReadonlyArray<string>) =>
      Effect.forEach(ids, (id) => resolveEvidenceRef(current.snapshot, id));
    const checked = yield* Effect.result(
      Effect.gen(function* () {
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
    revisions.push({ target, revision, keptPlaces });
  }
  return { from, to, view, revisions, alreadyPending, blocked };
});

/** `repoint-preview`: the revisions `repoint` would propose, the ones already pending, and the blocked. */
export const previewTastePlaceRepoint = Effect.fn("taste.previewTastePlaceRepoint")(function* (
  input: RepointPlaceInput,
) {
  const plan = yield* planRepointRevisions(input);
  const result: RepointPreviewResult = {
    from: plan.from,
    to: plan.to,
    revisions: plan.revisions.map((planned) => ({
      supersedes: summarizeDerivation(plan.view, planned.target),
      keptPlaces: [...planned.keptPlaces],
    })),
    alreadyPending: plan.alreadyPending,
    blocked: plan.blocked,
  };
  return result;
});

export const repointTastePlace = Effect.fn("taste.repointTastePlace")(function* (input: RepointPlaceInput) {
  const store = yield* TasteStore;
  const plan = yield* planRepointRevisions(input);
  const written = yield* Effect.forEach(plan.revisions, (planned) =>
    Effect.map(store.write(planned.revision), ({ path }) => ({ ...planned, path })),
  );
  const after: ViewSource = { snapshot: yield* store.snapshot, catalog: store.config.catalog };
  const result: RepointPlaceResult = {
    from: plan.from,
    to: plan.to,
    proposals: written.map((planned) => ({
      supersedes: summarizeDerivation(after, planned.target),
      revision: summarizeDerivation(after, planned.revision),
      path: planned.path,
    })),
    alreadyPending: plan.alreadyPending,
    blocked: plan.blocked,
  };
  return result;
});
