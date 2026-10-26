import type { TasteOperationInput } from "@taste/core/operations";
import { Effect } from "effect";

import { runReviewOperation, runReviewOperations } from "#review/infrastructure/taste-core.server.ts";

/** Recall and the hook payload for the same prompt, against one open store. */
export const readRecallWithHookPayload = (
  recallInput: TasteOperationInput<"recall">,
  hookInput: TasteOperationInput<"hook-preview">,
) =>
  runReviewOperations((run) =>
    Effect.gen(function* () {
      const recall = yield* run("recall", recallInput);
      const hook = yield* run("hook-preview", hookInput);
      return { recall, hook };
    }),
  );

export const readRecallExplanation = (input: TasteOperationInput<"recall-explain">) =>
  runReviewOperation("recall-explain", input);
