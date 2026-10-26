/**
 * What every review server function returns: the operation's output, or core's failure envelope
 * (sentence, category, tag and retry fields). Browser-safe types only; the server side builds these
 * in `infrastructure/taste-core.server.ts`.
 */
import type { TasteFailureEnvelope } from "@taste/core/operations";

/**
 * Core's failure envelope, exactly as the CLI's `--json` and MCP serialise it. `Network` is the
 * browser's own tag for a request that never reached core.
 */
export type ReviewFailure = Omit<TasteFailureEnvelope, "tag"> & {
  readonly tag: TasteFailureEnvelope["tag"] | "Network";
};

export type ReviewOutcome<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly failure: ReviewFailure };

/** Where the reviewer asks the server to stand: a directory to resolve, or places as given. */
export interface ReviewContextRequest {
  readonly in?: string | undefined;
  readonly at?: ReadonlyArray<string> | undefined;
}

/** A failed query, thrown so TanStack Query treats it as an error while keeping the category. */
export class ReviewQueryError extends Error {
  readonly failure: ReviewFailure;
  constructor(failure: ReviewFailure) {
    super(failure.sentence);
    this.name = "ReviewQueryError";
    this.failure = failure;
  }
}

/** Unwraps a query's outcome; failures become a `ReviewQueryError`. */
export const unwrapReviewOutcome = <A>(outcome: ReviewOutcome<A>): A => {
  if (outcome.ok) return outcome.value;
  throw new ReviewQueryError(outcome.failure);
};

/** The outcome with its value mapped; a failure passes through unchanged. */
export const mapReviewOutcome = <A, B>(outcome: ReviewOutcome<A>, map: (value: A) => B): ReviewOutcome<B> =>
  outcome.ok ? { ok: true, value: map(outcome.value) } : outcome;
