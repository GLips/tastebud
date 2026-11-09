/**
 * `decide`: a human's accept, reject or retract. Reached only through the review server and the
 * seed, from any status `decisionInvalidReason` allows. An accept may amend the scope, and re-runs the
 * repeat check against the scope it settles on. Accepting an accepted derivation again moves it in place.
 */
import { Effect, Schema } from "effect";

import { decisionInvalidReason, type DerivationLookup } from "#core/domains/derivation-lifecycle/index.ts";
import { readScopeOverride } from "#core/domains/derivation-scope/index.ts";
import { requireLiveDerivedKind } from "#core/domains/kind-catalog/index.ts";
import { scopeGroupKey, scopePlacesOf } from "#core/domains/places/index.ts";
import {
  derivationById,
  derivationStateOf,
  resolveDerivationRef,
  type StoreSnapshot,
} from "#core/domains/record-snapshot/index.ts";
import { buildDerivationView, type ViewSource } from "#core/domains/record-views/index.ts";
import { type DecisionRecord, proposedScopeOf, SCHEMA_VERSION } from "#core/domains/records/index.ts";
import { DecisionOutcomeSchema } from "#core/domains/taste-vocabulary/index.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { homeDirectory } from "#core/infrastructure/home-directory.ts";
import { stampNewRecord } from "#core/infrastructure/record-ids.ts";
import { withStoreLock } from "#core/infrastructure/store-lock.ts";
import { OptionalTrimmedText, OptionalTrimmedTextList, TrimmedText } from "#core/shared/input-text.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

import { DecisionNotAllowed, WideningNeedsAcknowledgement } from "../errors.ts";
import { DecideScopeFields, unacknowledgedMatches } from "./accept-preview.ts";

export const DecideDerivationInput = Schema.Struct({
  ref: TrimmedText.annotate({ description: "The derivation to decide" }),
  outcome: DecisionOutcomeSchema,
  reason: OptionalTrimmedText.annotate({ description: "Required for reject" }),
  ...DecideScopeFields,
  acknowledges: OptionalTrimmedTextList.annotate({
    description: "Accept only: blocking near repeats the human accepts anyway",
  }),
});
export type DecideDerivationInput = typeof DecideDerivationInput.Type;

const lookupIn = (snapshot: StoreSnapshot): DerivationLookup => ({
  statusOf: (id) => {
    const derivation = derivationById(snapshot, id);
    return derivation === undefined ? undefined : derivationStateOf(snapshot, derivation).status;
  },
  kindOf: (id) => derivationById(snapshot, id)?.kind,
});

const checkDecisionFields = (input: DecideDerivationInput) => {
  const problems: Array<string> = [];
  if (input.outcome === "reject" && input.reason === undefined) problems.push("reason: a rejection needs a reason");
  if (input.outcome !== "accept" && (input.scope !== undefined || input.places !== undefined))
    problems.push("scope: only an accept may amend the scope");
  if (input.outcome !== "accept" && input.acknowledges !== undefined)
    problems.push("acknowledges: only an accept acknowledges near repeats");
  return problems.length > 0 ? Effect.fail(new InvalidTasteInput({ problems })) : Effect.void;
};

/** Set by the operation from its caller: the process writing on the human's behalf, e.g. the seed. */
export interface DecideDerivationOptions {
  readonly writtenBy?: string | undefined;
}

/** Records a human decision after rechecking validity under the lock. Stale decisions fail with DecisionNotAllowed. */
export const decideDerivation = Effect.fn("decisions.decideDerivation")(function* (
  input: DecideDerivationInput,
  options: DecideDerivationOptions = {},
) {
  const store = yield* TasteStore;
  const { config } = store;
  yield* checkDecisionFields(input);
  const override = yield* readScopeOverride(input, homeDirectory());
  return yield* withStoreLock(
    store.root,
    "decide",
    Effect.gen(function* () {
      const snapshot = yield* store.snapshot;
      const view: ViewSource = { snapshot, catalog: config.catalog };
      const derivation = yield* resolveDerivationRef(snapshot, input.ref);
      yield* requireLiveDerivedKind(config.catalog, derivation);
      const invalid = decisionInvalidReason(input.outcome, derivation, lookupIn(snapshot));
      if (invalid !== undefined)
        return yield* new DecisionNotAllowed({
          target: derivation.id,
          statement: derivation.statement,
          outcome: input.outcome,
          status: derivationStateOf(snapshot, derivation).status,
          problem: invalid,
        });
      const acknowledges = yield* Effect.forEach(input.acknowledges ?? [], (ref) =>
        resolveDerivationRef(snapshot, ref),
      );
      if (input.outcome === "reject") {
        const state = derivationStateOf(snapshot, derivation);
        if (state.status === "rejected" && state.decidingDecision?.reason === input.reason)
          return yield* new DecisionNotAllowed({
            target: derivation.id,
            statement: derivation.statement,
            outcome: input.outcome,
            status: state.status,
            problem: "it is already rejected for that reason",
          });
      }
      if (input.outcome === "accept") {
        const settled = override ?? proposedScopeOf(derivation);
        const state = derivationStateOf(snapshot, derivation);
        if (state.status === "accepted" && scopeGroupKey(settled) === scopeGroupKey(state.effectiveScope))
          return yield* new DecisionNotAllowed({
            target: derivation.id,
            statement: derivation.statement,
            outcome: input.outcome,
            status: state.status,
            problem: "it is already accepted with this scope",
          });
        const pending = unacknowledgedMatches(view, derivation, settled);
        const acknowledged = new Set(acknowledges.map((record) => record.id));
        const missing = pending.filter((match) => !acknowledged.has(match.id));
        if (missing.length > 0)
          return yield* new WideningNeedsAcknowledgement({
            target: derivation.id,
            statement: derivation.statement,
            matches: missing,
          });
        const pendingIds = new Set(pending.map((match) => match.id));
        const stray = acknowledges.filter((record) => !pendingIds.has(record.id));
        if (stray.length > 0)
          return yield* new InvalidTasteInput({
            problems: stray.map(
              (record) => `acknowledges: ${record.id} is not a near repeat this accept must acknowledge; leave it out`,
            ),
          });
      }
      const stamp = yield* stampNewRecord;
      const decision: DecisionRecord = {
        id: stamp.id,
        type: "Decision",
        schema_version: SCHEMA_VERSION,
        target: derivation.id,
        outcome: input.outcome,
        by: config.owner,
        at: stamp.at,
        ...(input.reason !== undefined && { reason: input.reason }),
        ...(override !== undefined && { scope: override.scope }),
        ...(override?.scope === "places" && { places: scopePlacesOf(override) }),
        ...(acknowledges.length > 0 && { acknowledges: acknowledges.map((record) => record.id) }),
        ...(options.writtenBy !== undefined && { via: options.writtenBy }),
      };
      yield* store.write(decision);
      return {
        decision,
        derivation: buildDerivationView({ snapshot: yield* store.snapshot, catalog: config.catalog }, derivation),
      };
    }),
  );
});
