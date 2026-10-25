/**
 * The review UI's one door into core. Every server function builds a `via: "review"` caller here,
 * resolves the context the browser asked for, and runs a registry operation. importProtection keeps
 * this file, and core behind it, out of the browser bundle.
 */
import { Effect } from "effect";

import {
  describeTasteFailure,
  InvalidTasteInput,
  listListenerHeartbeats,
  provideTasteStore,
  resolveStoreRoot,
  resolveTasteContext,
  runTasteOperation,
  type TasteCaller,
  type TasteError,
  type TasteOperationName,
  type TasteOperationOutput,
  type TasteStore,
} from "../core/index.ts";
import { UNKNOWN_TASTE_CONTEXT } from "../shared/places.ts";
import type { ReviewContextRequest, ReviewFailure, ReviewOutcome } from "./review-outcome.ts";

/** Read per call, so `TASTE_STORE` set by `taste review` is honoured without restarting anything. */
const tasteStoreRoot = (): string => resolveStoreRoot({ env: process.env.TASTE_STORE });

const reviewFailureOf = (error: TasteError): ReviewFailure => {
  const { sentence, category } = describeTasteFailure(error, "review");
  return {
    sentence,
    category,
    tag: error._tag,
    ...((error._tag === "WideningNeedsAcknowledgement" || error._tag === "NearRepeat") && { matches: error.matches }),
  };
};

// The review server has no cwd of its own worth trusting: with no dir or places, the context is unknown.
const reviewCallerFor = (request: ReviewContextRequest | undefined, actor?: string) =>
  Effect.map(
    request?.dir !== undefined || (request?.at?.length ?? 0) > 0
      ? resolveTasteContext({ in: request?.dir, at: request?.at })
      : Effect.succeed(UNKNOWN_TASTE_CONTEXT),
    (context): TasteCaller => ({ via: "review", context, ...(actor !== undefined && { actor }) }),
  );

const settle = <A>(effect: Effect.Effect<A, TasteError, TasteStore>): Promise<ReviewOutcome<A>> =>
  Effect.runPromise(
    effect.pipe(
      Effect.map((value): ReviewOutcome<A> => ({ ok: true, value })),
      Effect.catch((error) => Effect.succeed<ReviewOutcome<A>>({ ok: false, failure: reviewFailureOf(error) })),
      provideTasteStore(tasteStoreRoot()),
      Effect.catch((error) => Effect.succeed<ReviewOutcome<A>>({ ok: false, failure: reviewFailureOf(error) })),
    ),
  );

/** Runs one registry operation as the review caller, standing where `context` says. */
export const runReviewOperation = <N extends TasteOperationName>(
  name: N,
  input: unknown,
  context?: ReviewContextRequest,
): Promise<ReviewOutcome<TasteOperationOutput<N>>> =>
  settle(Effect.flatMap(reviewCallerFor(context), (caller) => runTasteOperation(name, input, caller)));

/** Several operations against one open store, for screens that need them side by side. */
export const runReviewOperations = <A>(
  build: (
    run: <N extends TasteOperationName>(
      name: N,
      input: unknown,
    ) => Effect.Effect<TasteOperationOutput<N>, TasteError, TasteStore>,
  ) => Effect.Effect<A, TasteError, TasteStore>,
  context?: ReviewContextRequest,
): Promise<ReviewOutcome<A>> =>
  settle(
    Effect.flatMap(reviewCallerFor(context), (caller) =>
      build((name, input) => runTasteOperation(name, input, caller)),
    ),
  );

/** The actor a scope revision from the review UI is proposed as: only the owner's accept ratifies it. */
const REVIEW_REVISION_ACTOR = "process:review";

/** A pending revision of an accepted derivation: same statement and evidence, the scope the owner chose. */
export const proposeReviewScopeRevision = (request: {
  readonly target: string;
  readonly scope?: "global" | "places" | undefined;
  readonly places?: ReadonlyArray<string> | undefined;
  /** The blocking near repeats the reviewer looked at, with what is different now. */
  readonly despite?: ReadonlyArray<string> | undefined;
  readonly despiteCase?: string | undefined;
}) =>
  settle(
    Effect.gen(function* () {
      const caller = yield* reviewCallerFor(undefined, REVIEW_REVISION_ACTOR);
      const shown = yield* runTasteOperation("show", { ref: request.target }, caller);
      const record = shown.derivation?.derivation;
      if (record === undefined)
        return yield* new InvalidTasteInput({ problems: [`target: ${request.target} is not a derivation`] });
      return yield* runTasteOperation(
        "propose",
        {
          kind: record.kind,
          statement: record.statement,
          supports: record.supports,
          ...(record.contradicts !== undefined && { contradicts: record.contradicts }),
          ...(record.subject !== undefined && { subject: record.subject }),
          supersedes: record.id,
          reasoning: "Scope revised in the review UI; the statement and evidence are unchanged.",
          ...(request.scope === "global" ? { global: true } : { places: request.places ?? [] }),
          ...(request.despite !== undefined && { despite: request.despite }),
          ...(request.despiteCase !== undefined && { despite_case: request.despiteCase }),
        },
        caller,
      );
    }),
  );

/** Agents waiting on threads. Not a registry operation: it reads listener heartbeats, never records. */
export const readListenerHeartbeats = () => settle(listListenerHeartbeats);
