/**
 * What every review server function returns: the operation's output, or core's failure as a sentence
 * plus its category. Browser-safe types only; the server side builds these in `taste-store.server.ts`.
 */
import type { RepeatMatch, TasteFailureCategory } from "../core/index.ts";

export interface ReviewFailure {
  /** `describeTasteFailure`'s sentence, ready to show. */
  readonly sentence: string;
  readonly category: TasteFailureCategory;
  /** The core error's tag, so a screen can tell a resolution failure from a refusal. */
  readonly tag: string;
  /** The unacknowledged near repeats, when an accept was refused for widening or a revision for repeating. */
  readonly matches?: ReadonlyArray<RepeatMatch>;
}

export type ReviewOutcome<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly failure: ReviewFailure };

/** Where the reviewer asks the server to stand: a directory to resolve, or places as given. */
export interface ReviewContextRequest {
  readonly dir?: string | undefined;
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
