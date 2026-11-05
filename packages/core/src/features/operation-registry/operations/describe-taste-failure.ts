/**
 * The one mapper from a core failure to what a shell shows: the CLI, MCP and the review server all
 * call `describeTasteFailure`, so a failure reads the same everywhere.
 */
import { Match } from "effect";

import type { RepeatMatch } from "#core/domains/record-views/index.ts";
import type { TasteSurface } from "#core/shared/taste-surface.ts";

import type { TasteError } from "./taste-error.ts";

/**
 * `input`: the caller should change what it sent. `refused`: valid, but the store's rules say no.
 * `conflict`: the store changed or is busy. `broken`: the store or environment needs fixing.
 */
export type TasteFailureCategory = "input" | "refused" | "conflict" | "broken";

const EXIT_CODE_BY_CATEGORY: Record<TasteFailureCategory, number> = { broken: 1, input: 2, refused: 3, conflict: 4 };

const categoryOf = (error: TasteError): TasteFailureCategory =>
  Match.valueTags<TasteError, Record<TasteError["_tag"], () => TasteFailureCategory>>(error, {
    StoreNotInitialised: () => "input",
    StaleTasteConfig: () => "conflict",
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
    StoreLockTimeout: () => "conflict",
    StoreReadFailed: () => "broken",
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

const retryFieldsOf = (error: TasteError): TasteFailureRetry =>
  Match.value(error).pipe(
    Match.tags({
      NearRepeat: (matched) => ({ matches: matched.matches }),
      WideningNeedsAcknowledgement: (matched) => ({ matches: matched.matches }),
      AmbiguousRecordRef: (matched) => ({ candidates: matched.candidates }),
      UnknownKind: (matched) => ({ known: matched.known }),
      InvalidTasteInput: (matched) => ({ problems: matched.problems }),
    }),
    Match.orElse((): TasteFailureRetry => ({})),
  );

/** Refusals whose retry hint names inputs, so their sentence depends on the surface. */
const sentenceOf = (error: TasteError, surface: TasteSurface): string =>
  Match.value(error).pipe(
    Match.tags({
      NearRepeat: (matched) => matched.sentenceFor(surface),
      ScopeRequired: (matched) => matched.sentenceFor(surface),
      KindNotRecallable: (matched) => matched.sentenceFor(surface),
      StoreNotInitialised: (matched) => matched.sentenceFor(surface),
    }),
    Match.orElse((other) => other.message),
  );

export interface TasteFailureDescription {
  readonly envelope: TasteFailureEnvelope;
  /** 1 broken, 2 input, 3 refused, 4 conflict. */
  readonly exitCode: number;
}

/** The envelope and CLI exit code for any core failure, worded for `surface`. Exhaustive over `TasteError`. */
export const describeTasteFailure = (error: TasteError, surface: TasteSurface): TasteFailureDescription => {
  const category = categoryOf(error);
  const sentence = sentenceOf(error, surface);
  return {
    envelope: { tag: error._tag, sentence, category, ...retryFieldsOf(error) },
    exitCode: EXIT_CODE_BY_CATEGORY[category],
  };
};
