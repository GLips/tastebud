/**
 * Every failure core can raise, each a tagged error whose `message` is the sentence a person or agent
 * reads. `describeTasteFailure` is the one mapper the CLI, MCP and the review server share.
 */
import { Data, Match } from "effect";

import { formatScopeLabel, type TasteContext } from "../shared/places.ts";
import type { DecisionOutcome, DerivationStatus } from "../shared/vocabulary.ts";
import type { RepeatMatch } from "./view-schemas.ts";

/** No `taste.config.ts` at the resolved root. */
export class StoreNotInitialised extends Data.TaggedError("StoreNotInitialised")<{
  readonly root: string;
}> {
  override get message() {
    return `No Taste store at ${this.root}. Run \`taste init\` or \`taste seed\`, or pass --store / set TASTE_STORE.`;
  }
}

/** `taste init` (or seed) on a root that already holds a store. */
export class StoreAlreadyExists extends Data.TaggedError("StoreAlreadyExists")<{
  readonly root: string;
}> {
  override get message() {
    return `A Taste store already exists at ${this.root}.`;
  }
}

/** Seeding needs a store with no records yet. */
export class StoreNotEmpty extends Data.TaggedError("StoreNotEmpty")<{
  readonly root: string;
  readonly recordCount: number;
}> {
  override get message() {
    return `The store at ${this.root} already holds ${this.recordCount} records; seeding needs an empty store.`;
  }
}

/** `taste.config.ts` failed to load or validate. Each problem names its field. */
export class InvalidConfig extends Data.TaggedError("InvalidConfig")<{
  readonly path: string;
  readonly problems: ReadonlyArray<string>;
}> {
  override get message() {
    return `${this.path} is invalid: ${this.problems.join("; ")}.`;
  }
}

/** Caller-supplied input failed validation, at decode time or against the store. */
export class InvalidTasteInput extends Data.TaggedError("InvalidTasteInput")<{
  readonly problems: ReadonlyArray<string>;
}> {
  override get message() {
    return `Invalid input: ${this.problems.join("; ")}.`;
  }
}

/** A file in the store does not parse as a record. Hand edits are the usual cause. */
export class CorruptRecordFile extends Data.TaggedError("CorruptRecordFile")<{
  readonly path: string;
  readonly problem: string;
}> {
  override get message() {
    return `Unreadable record file ${this.path}: ${this.problem}`;
  }
}

/** An id, short id or id prefix that names no record of the expected type. */
export class UnknownRecordRef extends Data.TaggedError("UnknownRecordRef")<{
  readonly ref: string;
  readonly expected: string;
}> {
  override get message() {
    return `No ${this.expected} matches "${this.ref}".`;
  }
}

/** A short id or prefix that matches more than one record. */
export class AmbiguousRecordRef extends Data.TaggedError("AmbiguousRecordRef")<{
  readonly ref: string;
  readonly candidates: ReadonlyArray<string>;
}> {
  override get message() {
    return `"${this.ref}" matches several records: ${this.candidates.join(", ")}.`;
  }
}

/** A kind key the catalog has never had. */
export class UnknownKind extends Data.TaggedError("UnknownKind")<{
  readonly kind: string;
  readonly family: "source" | "derived";
  readonly known: ReadonlyArray<string>;
}> {
  override get message() {
    const known = this.known.length === 0 ? "none are configured" : `known: ${this.known.join(", ")}`;
    return `"${this.kind}" is not a ${this.family} kind (${known}).`;
  }
}

/** A record whose kind left the catalog. Retired records are list and show only. */
export class RetiredKind extends Data.TaggedError("RetiredKind")<{
  readonly kind: string;
  readonly recordId: string;
}> {
  override get message() {
    return `${this.recordId} is a "${this.kind}", a kind no longer in taste.config.ts; it can only be listed and shown.`;
  }
}

/** Recall or context asked for a kind whose policy is `never`. */
export class KindNotRecallable extends Data.TaggedError("KindNotRecallable")<{
  readonly kind: string;
}> {
  override get message() {
    return `"${this.kind}" has recall: never; use \`taste list --kind ${this.kind}\` instead.`;
  }
}

/** A proposal with no scope given, from an unknown context. */
export class ScopeRequired extends Data.TaggedError("ScopeRequired")<{
  readonly context: TasteContext;
  readonly retryExamples: ReadonlyArray<string>;
}> {
  override get message() {
    return `No scope: the context is unknown, so this proposal must say where it applies. Retry with ${this.retryExamples.join(", or ")}.`;
  }
}

/**
 * The resolver could not say where the caller is: git timed out, an origin was malformed, or a
 * custom resolver threw. Never a silent switch to another identity.
 */
export class PlaceResolutionFailed extends Data.TaggedError("PlaceResolutionFailed")<{
  readonly directory: string;
  readonly problem: string;
}> {
  override get message() {
    return `Could not resolve the place for ${this.directory}: ${this.problem}`;
  }
}

const formatMatchLines = (matches: ReadonlyArray<RepeatMatch>) =>
  matches.map(
    (match) =>
      `  - "${match.statement}" [${match.id}] ${match.status}, similarity ${match.similarity.toFixed(2)}, ` +
      `scope ${formatScopeLabel(match.effectiveScope)}${match.reason === undefined ? "" : `, reason: ${match.reason}`}`,
  );

/** `propose` hit near repeats of the same kind with overlapping scopes, not all named in `despite`. */
export class NearRepeat extends Data.TaggedError("NearRepeat")<{
  readonly kind: string;
  readonly matches: ReadonlyArray<RepeatMatch>;
}> {
  override get message() {
    const ids = this.matches.map((match) => match.id).join(" --despite ");
    return [
      `Refused: this is a near repeat of an existing ${this.kind} whose scope overlaps.`,
      ...formatMatchLines(this.matches),
      `Usually the right move is to drop it. If something genuinely changed, re-propose with --despite ${ids} --why "<what is different now>".`,
    ].join("\n");
  }
}

/** An accept whose effective scope overlaps blocking matches that neither `despite` nor `acknowledges` names. */
export class WideningNeedsAcknowledgement extends Data.TaggedError("WideningNeedsAcknowledgement")<{
  readonly target: string;
  readonly matches: ReadonlyArray<RepeatMatch>;
}> {
  override get message() {
    return [
      `Accepting ${this.target} with this scope overlaps near repeats it hasn't acknowledged:`,
      ...formatMatchLines(this.matches),
      "Acknowledge them to accept anyway.",
    ].join("\n");
  }
}

/** The decision is not valid for the derivation's current state (usually someone decided first). */
export class DecisionNotAllowed extends Data.TaggedError("DecisionNotAllowed")<{
  readonly target: string;
  readonly outcome: DecisionOutcome;
  readonly status: DerivationStatus;
  readonly problem: string;
}> {
  override get message() {
    return `Cannot ${this.outcome} ${this.target}: ${this.problem}.`;
  }
}

/** Another process held `.index/decide.lock` for too long. */
export class DecisionLockTimeout extends Data.TaggedError("DecisionLockTimeout")<{
  readonly lockPath: string;
}> {
  override get message() {
    return `Another decision is being written (${this.lockPath} is held). Try again in a moment.`;
  }
}

/** A filesystem write failed, including an exclusive create hitting an existing path. */
export class StoreWriteFailed extends Data.TaggedError("StoreWriteFailed")<{
  readonly path: string;
  readonly problem: string;
}> {
  override get message() {
    return `Write failed at ${this.path}: ${this.problem}`;
  }
}

export type TasteError =
  | StoreNotInitialised
  | StoreAlreadyExists
  | StoreNotEmpty
  | InvalidConfig
  | InvalidTasteInput
  | CorruptRecordFile
  | UnknownRecordRef
  | AmbiguousRecordRef
  | UnknownKind
  | RetiredKind
  | KindNotRecallable
  | ScopeRequired
  | PlaceResolutionFailed
  | NearRepeat
  | WideningNeedsAcknowledgement
  | DecisionNotAllowed
  | DecisionLockTimeout
  | StoreWriteFailed;

/**
 * `input`: the caller should change what it sent. `refused`: valid, but the store's rules say no.
 * `conflict`: the store changed or is busy. `broken`: the store or environment needs fixing.
 */
export type TasteFailureCategory = "input" | "refused" | "conflict" | "broken";

const EXIT_CODE_BY_CATEGORY: Record<TasteFailureCategory, number> = { broken: 1, input: 2, refused: 3, conflict: 4 };

const categoryOf = (error: TasteError): TasteFailureCategory =>
  Match.valueTags<TasteError, Record<TasteError["_tag"], () => TasteFailureCategory>>(error, {
    StoreNotInitialised: () => "input",
    StoreAlreadyExists: () => "conflict",
    StoreNotEmpty: () => "conflict",
    InvalidConfig: () => "broken",
    InvalidTasteInput: () => "input",
    CorruptRecordFile: () => "broken",
    UnknownRecordRef: () => "input",
    AmbiguousRecordRef: () => "input",
    UnknownKind: () => "input",
    RetiredKind: () => "refused",
    KindNotRecallable: () => "input",
    ScopeRequired: () => "input",
    PlaceResolutionFailed: () => "broken",
    NearRepeat: () => "refused",
    WideningNeedsAcknowledgement: () => "refused",
    DecisionNotAllowed: () => "conflict",
    DecisionLockTimeout: () => "conflict",
    StoreWriteFailed: () => "broken",
  });

export interface TasteFailureDescription {
  readonly sentence: string;
  readonly category: TasteFailureCategory;
  /** 1 broken, 2 input, 3 refused, 4 conflict. */
  readonly exitCode: number;
}

/** The sentence, category and CLI exit code for any core failure. Exhaustive over `TasteError`. */
export const describeTasteFailure = (error: TasteError): TasteFailureDescription => {
  const category = categoryOf(error);
  return { sentence: error.message, category, exitCode: EXIT_CODE_BY_CATEGORY[category] };
};
