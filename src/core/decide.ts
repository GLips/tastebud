/**
 * `decide`: a human's accept, reject or retract. Reached only through the review server and the
 * seed. An accept may amend the scope, and re-runs the repeat check against the scope it settles on.
 */
import { randomUUID } from "node:crypto";
import {
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Effect, Schema } from "effect";

import { OptionalTrimmedText, OptionalTrimmedTextList, TrimmedText } from "../shared/input-text.ts";
import { type DerivationScope, scopePlacesOf } from "../shared/places.ts";
import { DecisionOutcomeSchema } from "../shared/vocabulary.ts";
import { canonicalInputPlaces } from "./caller.ts";
import { requireLiveDerivedKind } from "./catalog.ts";
import {
  DecisionLockTimeout,
  DecisionNotAllowed,
  InvalidTasteInput,
  StoreWriteFailed,
  WideningNeedsAcknowledgement,
} from "./errors.ts";
import { stampNewRecord } from "./ids.ts";
import { decisionInvalidReason, type DerivationLookup } from "./lifecycle.ts";
import { type DecisionRecord, type DerivationRecord, proposedScopeOf, SCHEMA_VERSION } from "./records.ts";
import { findRepeatMatches, supersessionLineageOf } from "./repeat-check.ts";
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

/** A complete scope override from input, or undefined to keep the proposed scope. */
const readScopeOverride = Effect.fn("taste.readScopeOverride")(function* (input: PreviewAcceptanceInput) {
  if (input.scope !== undefined) return yield* readChosenScope(input.scope, input.places);
  if (input.places !== undefined)
    return yield* new InvalidTasteInput({ problems: ["places: give scope: places along with them"] });
  return undefined;
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
    excludeIds: [derivation.id, ...supersessionLineageOf(view.snapshot, derivation.supersedes)],
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

const errorCodeOf = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error ? error.code : undefined;

/** Whether `pid` is a running process. EPERM means it exists under another user. */
const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCodeOf(error) === "EPERM";
  }
};

const readLockFile = (path: string) => {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (errorCodeOf(error) === "ENOENT") return undefined;
    throw error;
  }
};

/**
 * A held lock is stale only when its holder's pid is dead. A lock with no readable pid (a holder
 * that crashed between create and write) is stale once it is older than the wait.
 */
const isStaleLock = (path: string, content: string) => {
  const pid = Number(content.split(" ")[0]);
  if (Number.isInteger(pid) && pid > 0) return !isProcessAlive(pid);
  const held = statSync(path, { throwIfNoEntry: false });
  return held !== undefined && Date.now() - held.mtimeMs > LOCK_WAIT_MS;
};

/**
 * Moves a stale lock aside. The rename is atomic, so of two processes stealing at once only one
 * moves the stale file; if what got moved is no longer the stale content, it is put back.
 */
const stealStaleLock = (path: string, staleContent: string) => {
  const aside = `${path}.stale-${randomUUID()}`;
  try {
    renameSync(path, aside);
  } catch (error) {
    if (errorCodeOf(error) === "ENOENT") return;
    throw error;
  }
  if (readFileSync(aside, "utf8") === staleContent) rmSync(aside, { force: true });
  else
    try {
      linkSync(aside, path);
    } finally {
      rmSync(aside, { force: true });
    }
};

/** One attempt: true when this process now holds the lock under `token`. */
const tryCreateLock = (path: string, token: string): boolean => {
  try {
    const fd = openSync(path, "wx");
    try {
      writeSync(fd, token);
    } finally {
      closeSync(fd);
    }
    return true;
  } catch (error) {
    if (errorCodeOf(error) !== "EEXIST") throw error;
    const content = readLockFile(path);
    if (content !== undefined && isStaleLock(path, content)) stealStaleLock(path, content);
    return false;
  }
};

/** Removes the lock only if it is still ours. */
const releaseLock = (path: string, token: string) => {
  if (readLockFile(path) === token) rmSync(path, { force: true });
};

/**
 * Runs `use` holding `.index/decide.lock`, so the state recheck and the write are atomic across
 * processes: two accepts of revisions superseding the same target can't both land. The lock file
 * holds `<pid> <token>`, so only a dead holder's lock is taken over and release never removes
 * another process's lock.
 */
const withDecisionLock = <A, E, R>(
  root: string,
  use: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | DecisionLockTimeout | StoreWriteFailed, R> => {
  const lockPath = join(indexDirOf(root), "decide.lock");
  const token = `${process.pid} ${randomUUID()}\n`;
  const attempt = Effect.try({
    try: () => {
      mkdirSync(indexDirOf(root), { recursive: true });
      return tryCreateLock(lockPath, token);
    },
    catch: (error) => new StoreWriteFailed({ path: lockPath, problem: String(error) }),
  });
  const acquire = Effect.gen(function* () {
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (!(yield* attempt)) {
      if (Date.now() > deadline) return yield* new DecisionLockTimeout({ lockPath });
      yield* Effect.sleep("20 millis");
    }
  });
  return Effect.acquireUseRelease(
    acquire,
    () => use,
    () => Effect.sync(() => releaseLock(lockPath, token)),
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
