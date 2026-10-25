/**
 * `decide`: a human's accept, reject or retract. Reached only through the review server and the
 * seed. An accept may amend the scope, and re-runs the repeat check against the scope it settles on.
 */
import { closeSync, openSync, rmSync, statSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Effect, Schema } from "effect";

import { OptionalTrimmedText, OptionalTrimmedTextList, TrimmedText } from "../shared/input-text.ts";
import { type DerivationScope, scopePlacesOf } from "../shared/places.ts";
import { DecisionOutcomeSchema } from "../shared/vocabulary.ts";
import { canonicalInputPlaces } from "./caller.ts";
import { requireLiveDerivedKind } from "./catalog.ts";
import { DecisionLockTimeout, DecisionNotAllowed, InvalidTasteInput, WideningNeedsAcknowledgement } from "./errors.ts";
import { formatLocalIsoTime, newRecordId } from "./ids.ts";
import { decisionInvalidReason, type DerivationLookup } from "./lifecycle.ts";
import { type DecisionRecord, type DerivationRecord, proposedScopeOf, SCHEMA_VERSION } from "./records.ts";
import { findRepeatMatches } from "./repeat-check.ts";
import { indexDirOf } from "./store-files.ts";
import { derivationById, derivationStateOf, resolveDerivationRef, type StoreSnapshot, TasteStore } from "./store.ts";
import type { RepeatMatch } from "./view-schemas.ts";
import { buildDerivationView, summarizeDerivation, type ViewSource } from "./views.ts";

const ScopeOverrideFields = {
  scope: Schema.optionalKey(Schema.Literals(["global", "places"])).annotate({
    description: "Accept only: accept with this scope instead of the proposed one",
  }),
  places: OptionalTrimmedTextList.annotate({ description: "The places, when scope is places" }),
};

export const DecideDerivationInput = Schema.Struct({
  target: TrimmedText.annotate({ description: "The derivation to decide" }),
  outcome: DecisionOutcomeSchema,
  reason: OptionalTrimmedText.annotate({ description: "Required for reject" }),
  ...ScopeOverrideFields,
  acknowledges: OptionalTrimmedTextList.annotate({
    description: "Accept only: blocking near repeats the human accepts anyway",
  }),
});
export type DecideDerivationInput = typeof DecideDerivationInput.Type;

export const PreviewAcceptanceInput = Schema.Struct({
  target: TrimmedText,
  ...ScopeOverrideFields,
});
export type PreviewAcceptanceInput = typeof PreviewAcceptanceInput.Type;

/** A complete scope override from input, or undefined to keep the proposed scope. */
const readScopeOverride = Effect.fn("taste.readScopeOverride")(function* (input: PreviewAcceptanceInput) {
  if (input.scope === undefined) {
    if (input.places !== undefined)
      return yield* new InvalidTasteInput({ problems: ["places: give scope: places along with them"] });
    return undefined;
  }
  if (input.scope === "global") {
    if (input.places !== undefined)
      return yield* new InvalidTasteInput({ problems: ["places: a global scope has no places"] });
    const scope: DerivationScope = { scope: "global" };
    return scope;
  }
  if (input.places === undefined)
    return yield* new InvalidTasteInput({ problems: ["places: required and non-empty when scope is places"] });
  const places = yield* canonicalInputPlaces("places", input.places, homedir());
  const scope: DerivationScope = { scope: "places", places };
  return scope;
});

/**
 * Blocking matches under the scope an accept would settle on that the proposal's `despite` did not
 * already name. Each must be acknowledged before the accept lands.
 */
const unacknowledgedMatches = Effect.fn("taste.unacknowledgedMatches")(function* (
  view: ViewSource,
  derivation: DerivationRecord,
  effectiveScope: DerivationScope,
) {
  const repeat = yield* findRepeatMatches(view, {
    kind: derivation.kind,
    statement: derivation.statement,
    scope: effectiveScope,
    excludeIds: [derivation.id, ...(derivation.supersedes === undefined ? [] : [derivation.supersedes])],
  });
  const despite = new Set(derivation.despite ?? []);
  return repeat.blocking.filter((match) => !despite.has(match.id));
});

/** What the review UI's acceptance preview shows before an accept is sent. */
export const previewDerivationAcceptance = Effect.fn("taste.previewDerivationAcceptance")(function* (
  input: PreviewAcceptanceInput,
) {
  const store = yield* TasteStore;
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog: store.config.catalog };
  const derivation = yield* resolveDerivationRef(snapshot, input.target);
  yield* requireLiveDerivedKind(store.config.catalog, derivation);
  const override = yield* readScopeOverride(input);
  const effectiveScope = override ?? proposedScopeOf(derivation);
  return {
    derivation: summarizeDerivation(view, derivation),
    effectiveScope,
    needsAcknowledgement: yield* unacknowledgedMatches(view, derivation, effectiveScope),
  };
});

const LOCK_WAIT_MS = 5_000;
/** A lock older than this is from a crashed process; decisions take milliseconds. */
const LOCK_STALE_MS = 30_000;

const isAlreadyExists = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";

const tryCreateLock = (path: string): boolean => {
  try {
    const fd = openSync(path, "wx");
    writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
    closeSync(fd);
    return true;
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    const held = statSync(path, { throwIfNoEntry: false });
    if (held !== undefined && Date.now() - held.mtimeMs > LOCK_STALE_MS) rmSync(path, { force: true });
    return false;
  }
};

/**
 * Runs `use` holding `.index/decide.lock`, so the state recheck and the write are atomic across
 * processes: two accepts of revisions superseding the same target can't both land.
 */
const withDecisionLock = <A, E, R>(
  root: string,
  use: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | DecisionLockTimeout, R> => {
  const lockPath = join(indexDirOf(root), "decide.lock");
  const acquire = Effect.gen(function* () {
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (!tryCreateLock(lockPath)) {
      if (Date.now() > deadline) return yield* new DecisionLockTimeout({ lockPath });
      yield* Effect.sleep("20 millis");
    }
  });
  return Effect.acquireUseRelease(
    acquire,
    () => use,
    () => Effect.sync(() => rmSync(lockPath, { force: true })),
  );
};

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

/** Options only core's own writers set: the process writing on the human's behalf, e.g. the seed. */
export interface DecideDerivationOptions {
  readonly via?: string;
}

/** Records a human decision after rechecking validity under the lock. Stale decisions fail with DecisionNotAllowed. */
export const decideDerivation = Effect.fn("taste.decideDerivation")(function* (
  input: DecideDerivationInput,
  options: DecideDerivationOptions = {},
) {
  const store = yield* TasteStore;
  const { config } = store;
  yield* checkDecisionFields(input);
  const override = yield* readScopeOverride(input);
  return yield* withDecisionLock(
    store.root,
    Effect.gen(function* () {
      const snapshot = yield* store.snapshot;
      const view: ViewSource = { snapshot, catalog: config.catalog };
      const derivation = yield* resolveDerivationRef(snapshot, input.target);
      yield* requireLiveDerivedKind(config.catalog, derivation);
      const invalid = decisionInvalidReason(input.outcome, derivation, lookupIn(snapshot));
      if (invalid !== undefined)
        return yield* new DecisionNotAllowed({
          target: derivation.id,
          outcome: input.outcome,
          status: derivationStateOf(snapshot, derivation).status,
          problem: invalid,
        });
      const acknowledges = yield* Effect.forEach(input.acknowledges ?? [], (ref) =>
        resolveDerivationRef(snapshot, ref),
      );
      if (input.outcome === "accept") {
        const pending = yield* unacknowledgedMatches(view, derivation, override ?? proposedScopeOf(derivation));
        const acknowledged = new Set(acknowledges.map((record) => record.id));
        const missing = pending.filter((match: RepeatMatch) => !acknowledged.has(match.id));
        if (missing.length > 0)
          return yield* new WideningNeedsAcknowledgement({ target: derivation.id, matches: missing });
      }
      const decision: DecisionRecord = {
        id: newRecordId(),
        type: "Decision",
        schema_version: SCHEMA_VERSION,
        target: derivation.id,
        outcome: input.outcome,
        by: config.owner,
        at: formatLocalIsoTime(new Date()),
        ...(input.reason !== undefined && { reason: input.reason }),
        ...(override !== undefined && { scope: override.scope }),
        ...(override?.scope === "places" && { places: scopePlacesOf(override) }),
        ...(acknowledges.length > 0 && { acknowledges: acknowledges.map((record) => record.id) }),
        ...(options.via !== undefined && { via: options.via }),
      };
      yield* store.write(decision);
      return {
        decision,
        derivation: buildDerivationView({ snapshot: yield* store.snapshot, catalog: config.catalog }, derivation),
      };
    }),
  );
});
