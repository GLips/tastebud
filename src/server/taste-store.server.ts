/**
 * The review UI's one door into core. Every server function runs registry operations here as a
 * `via: "review"` caller with no cwd: where to stand comes only from an operation's own `in` / `at`.
 * importProtection keeps this file, and core behind it, out of the browser bundle.
 */
import { Effect } from "effect";

import {
  buildTasteOperationCaller,
  describeTasteFailure,
  provideTasteStore,
  resolveStoreRoot,
  runTasteOperation,
  type TasteError,
  type TasteOperationName,
  type TasteOperationOutput,
  type TasteStore,
} from "../core/index.ts";
import type { ReviewOutcome } from "./review-outcome.ts";

/** Read per call, so `TASTE_STORE` set by `taste review` is honoured without restarting anything. */
const tasteStoreRoot = (): string => resolveStoreRoot({ env: process.env.TASTE_STORE });

const runAsReviewer = <N extends TasteOperationName>(name: N, input: unknown) =>
  Effect.flatMap(buildTasteOperationCaller(name, { via: "review" }, input), (caller) =>
    runTasteOperation(name, input, caller),
  );

const settle = <A>(effect: Effect.Effect<A, TasteError, TasteStore>): Promise<ReviewOutcome<A>> =>
  Effect.runPromise(
    effect.pipe(
      Effect.map((value): ReviewOutcome<A> => ({ ok: true, value })),
      provideTasteStore(tasteStoreRoot()),
      Effect.catch((error) =>
        Effect.succeed<ReviewOutcome<A>>({ ok: false, failure: describeTasteFailure(error, "review").envelope }),
      ),
    ),
  );

/** Runs one registry operation as the review caller. */
export const runReviewOperation = <N extends TasteOperationName>(
  name: N,
  input: unknown,
): Promise<ReviewOutcome<TasteOperationOutput<N>>> => settle(runAsReviewer(name, input));

/** Several operations against one open store, for screens that need them side by side. */
export const runReviewOperations = <A>(
  build: (
    run: <N extends TasteOperationName>(
      name: N,
      input: unknown,
    ) => Effect.Effect<TasteOperationOutput<N>, TasteError, TasteStore>,
  ) => Effect.Effect<A, TasteError, TasteStore>,
): Promise<ReviewOutcome<A>> => settle(build(runAsReviewer));
