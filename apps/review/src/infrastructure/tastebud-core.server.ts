/**
 * The review UI's one door into non-domain core. Every server function runs registry operations here
 * as a `via: "review"` caller with no cwd: where to stand comes only from an operation's own `in` /
 * `at`. importProtection keeps this file, and core behind it, out of the browser bundle.
 */
import { tasteStoreFromEnv } from "@tastebud/core/host";
import {
  buildTasteOperationCaller,
  describeTasteFailure,
  runTasteOperation,
  type TasteError,
  type TasteOperationName,
  type TasteOperationOutput,
  type TasteOperationWireInput,
  type TasteServices,
} from "@tastebud/core/operations";
import { Effect } from "effect";

import type { ReviewOutcome } from "#review/shared/review-outcome.ts";

const runAsReviewer = <N extends TasteOperationName>(name: N, input: TasteOperationWireInput) =>
  Effect.flatMap(buildTasteOperationCaller(name, { via: "review" }, input), (caller) =>
    runTasteOperation(name, input, caller),
  );

/** The store is resolved per call, so `TASTEBUD_STORE` set by `tastebud review` is honoured without restarting. */
const settleReviewEffect = <A>(effect: Effect.Effect<A, TasteError, TasteServices>): Promise<ReviewOutcome<A>> =>
  Effect.runPromise(
    effect.pipe(
      Effect.map((value): ReviewOutcome<A> => ({ ok: true, value })),
      tasteStoreFromEnv(),
      Effect.catch((error) =>
        Effect.succeed<ReviewOutcome<A>>({ ok: false, failure: describeTasteFailure(error, "review").envelope }),
      ),
    ),
  );

/** Runs one registry operation as the review caller. */
export const runReviewOperation = <N extends TasteOperationName>(
  name: N,
  input: TasteOperationWireInput,
): Promise<ReviewOutcome<TasteOperationOutput<N>>> => settleReviewEffect(runAsReviewer(name, input));

/** Several operations against one open store, for screens that need them side by side. */
export const runReviewOperations = <A>(
  build: (
    run: <N extends TasteOperationName>(
      name: N,
      input: TasteOperationWireInput,
    ) => Effect.Effect<TasteOperationOutput<N>, TasteError, TasteServices>,
  ) => Effect.Effect<A, TasteError, TasteServices>,
): Promise<ReviewOutcome<A>> => settleReviewEffect(build(runAsReviewer));
