import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { decideReviewDerivation } from "../server/review-functions.ts";
import type { ReviewFailure } from "../server/review-outcome.ts";
import type { DecisionOutcome } from "../shared/vocabulary.ts";
import { recordSessionDecision } from "./review-session-log.ts";

export interface ReviewDecisionInput {
  readonly outcome: DecisionOutcome;
  readonly reason?: string;
  readonly scope?: "global" | "places";
  readonly places?: ReadonlyArray<string>;
  readonly acknowledges?: ReadonlyArray<string>;
}

/** Sends one decision; a refusal comes back as a failure for the card to show, never a retry. */
export const sendReviewDecision = async (target: string, input: ReviewDecisionInput) => {
  const outcome = await decideReviewDerivation({
    data: {
      ref: target,
      outcome: input.outcome,
      ...(input.reason !== undefined && { reason: input.reason }),
      ...(input.scope !== undefined && { scope: input.scope }),
      ...(input.places !== undefined && { places: [...input.places] }),
      ...(input.acknowledges !== undefined &&
        input.acknowledges.length > 0 && { acknowledges: [...input.acknowledges] }),
    },
  });
  if (outcome.ok) {
    const { derivation, decision } = outcome.value;
    recordSessionDecision({
      derivationId: derivation.id,
      kind: derivation.kind,
      statement: derivation.statement,
      outcome: decision.outcome,
      effectiveScope: derivation.effectiveScope,
      at: decision.at,
    });
  }
  return outcome;
};

/**
 * Decides one derivation. Every query refreshes afterwards either way, so a card shows the store
 * as it now is; the failure stays on the card until cleared.
 */
export function useReviewDecision(target: string) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<ReviewFailure | undefined>(undefined);
  const mutation = useMutation({
    mutationFn: (input: ReviewDecisionInput) => sendReviewDecision(target, input),
    onMutate: () => setFailure(undefined),
    onSuccess: (outcome) => setFailure(outcome.ok ? undefined : outcome.failure),
    onError: (error) => setFailure({ sentence: error.message, category: "broken", tag: "Network" }),
    onSettled: () => queryClient.invalidateQueries(),
  });
  return {
    decide: (input: ReviewDecisionInput) => mutation.mutateAsync(input),
    pending: mutation.isPending,
    failure,
    clearFailure: () => setFailure(undefined),
  };
}
