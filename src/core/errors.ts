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

/**
 * Where a failure is shown. Retry hints name inputs the way that surface spells them: CLI flags
 * (`--despite`) for the CLI, argument names (`despite`) for MCP tools.
 */
export type TasteSurface = "cli" | "mcp" | "review" | "hook";

const isArgumentSurface = (surface: TasteSurface) => surface === "mcp";

/** Recall or context asked for a kind whose policy is `never`. */
export class KindNotRecallable extends Data.TaggedError("KindNotRecallable")<{
  readonly kind: string;
}> {
  sentenceFor(surface: TasteSurface) {
    const instead = isArgumentSurface(surface)
      ? `taste_list with kind: "${this.kind}"`
      : `\`taste list --kind ${this.kind}\``;
    return `"${this.kind}" has recall: never; use ${instead} instead.`;
  }
  override get message() {
    return this.sentenceFor("cli");
  }
}

/** A proposal with no scope given, from an unknown context. */
export class ScopeRequired extends Data.TaggedError("ScopeRequired")<{
  readonly context: TasteContext;
}> {
  sentenceFor(surface: TasteSurface) {
    const retries = isArgumentSurface(surface)
      ? [
          'scope: "places" with places: ["github.com/<owner>/<repo>::"]',
          'scope: "global"',
          'in: "<your working directory>"',
        ]
      : ["--place github.com/<owner>/<repo>::", "--global", "--in <your working directory>"];
    return `No scope: the context is unknown, so this proposal must say where it applies. Retry with ${retries.join(", or ")}.`;
  }
  override get message() {
    return this.sentenceFor("cli");
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
  sentenceFor(surface: TasteSurface) {
    const ids = this.matches.map((match) => match.id);
    const retry =
      surface === "review"
        ? "each match ticked and what is different now"
        : isArgumentSurface(surface)
          ? `despite: ${JSON.stringify(ids)} and despite_case: "<what is different now>"`
          : `${ids.map((id) => `--despite ${id}`).join(" ")} --despite-case "<what is different now>"`;
    return [
      `Refused: this is a near repeat of an existing ${this.kind} whose scope overlaps.`,
      ...formatMatchLines(this.matches),
      `Usually the right move is to drop it. If something genuinely changed, re-propose with ${retry}.`,
    ].join("\n");
  }
  override get message() {
    return this.sentenceFor("cli");
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

/** A human operation reached through an agent surface. Only the review server may run them. */
export class OperationNotAllowed extends Data.TaggedError("OperationNotAllowed")<{
  readonly operation: string;
  readonly via: string;
}> {
  override get message() {
    return `${this.operation} is the owner's decision and runs only from the review UI, not via ${this.via}.`;
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
  | StoreWriteFailed
  | OperationNotAllowed;

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
    OperationNotAllowed: () => "refused",
  });

/**
 * What every shell serialises for a failure: the CLI's `--json` `{error}`, MCP's `structuredContent`
 * and the review server's outcome. Beyond the sentence, it carries the fields a retry is built from.
 */
export interface TasteFailureEnvelope {
  readonly tag: TasteError["_tag"];
  readonly sentence: string;
  readonly category: TasteFailureCategory;
  /** NearRepeat and WideningNeedsAcknowledgement: the matches to name in `despite` or `acknowledges`. */
  readonly matches?: ReadonlyArray<RepeatMatch>;
  /** AmbiguousRecordRef: the records the ref could mean. */
  readonly candidates?: ReadonlyArray<string>;
  /** UnknownKind: the kinds there are. */
  readonly known?: ReadonlyArray<string>;
  /** InvalidTasteInput: each problem, naming its field. */
  readonly problems?: ReadonlyArray<string>;
}

type TasteFailureRetry = Omit<TasteFailureEnvelope, "tag" | "sentence" | "category">;

const retryFieldsOf = (error: TasteError): TasteFailureRetry => {
  switch (error._tag) {
    case "NearRepeat":
    case "WideningNeedsAcknowledgement":
      return { matches: error.matches };
    case "AmbiguousRecordRef":
      return { candidates: error.candidates };
    case "UnknownKind":
      return { known: error.known };
    case "InvalidTasteInput":
      return { problems: error.problems };
    default:
      return {};
  }
};

export interface TasteFailureDescription {
  readonly envelope: TasteFailureEnvelope;
  /** 1 broken, 2 input, 3 refused, 4 conflict. */
  readonly exitCode: number;
}

/** The envelope and CLI exit code for any core failure, worded for `surface`. Exhaustive over `TasteError`. */
export const describeTasteFailure = (error: TasteError, surface: TasteSurface): TasteFailureDescription => {
  const category = categoryOf(error);
  const sentence =
    error._tag === "NearRepeat" || error._tag === "ScopeRequired" || error._tag === "KindNotRecallable"
      ? error.sentenceFor(surface)
      : error.message;
  return {
    envelope: { tag: error._tag, sentence, category, ...retryFieldsOf(error) },
    exitCode: EXIT_CODE_BY_CATEGORY[category],
  };
};
