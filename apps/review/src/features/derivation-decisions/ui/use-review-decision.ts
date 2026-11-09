import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DerivationScope } from "@tastebud/core/places";
import type { DecisionOutcome, DerivationStatus } from "@tastebud/core/taste-vocabulary";
import { useRef, useState } from "react";

import { STORE_WRITE_STALES } from "#review/shared/query-keys.ts";
import { refreshReviewQueriesAfterWrite } from "#review/shared/refresh-after-write.ts";
import type { ReviewFailure } from "#review/shared/review-outcome.ts";

import { decideReviewDerivation } from "../controllers/decide.ts";
import { recordSessionDecision } from "./review-session-log.ts";
import { scopeOverrideOf } from "./scope-draft.ts";

export interface ReviewDecisionInput {
  readonly outcome: DecisionOutcome;
  readonly reason?: string;
  readonly scope?: "global" | "places";
  readonly places?: ReadonlyArray<string>;
  readonly acknowledges?: ReadonlyArray<string>;
}

/** Where a derivation stood before a decision: enough to write the decision that puts it back. */
export interface DecisionStanding {
  readonly status: DerivationStatus;
  readonly proposedScope: DerivationScope;
  readonly effectiveScope: DerivationScope;
  readonly reason?: string | undefined;
  /** The near repeats its latest accept acknowledged, which putting it back to accepted acknowledges again. */
  readonly acknowledges?: ReadonlyArray<string> | undefined;
}

/** One decision, or two sent in order: an undo back to retracted re-accepts, then retracts. */
type ReviewDecisionSequence = readonly [ReviewDecisionInput] | readonly [ReviewDecisionInput, ReviewDecisionInput];

/** The accept that puts back where it applied, with the near repeats that accept had weighed. */
const reacceptOf = (before: DecisionStanding): ReviewDecisionInput => ({
  outcome: "accept",
  ...scopeOverrideOf(before.proposedScope, before.effectiveScope),
  ...(before.acknowledges !== undefined && { acknowledges: before.acknowledges }),
});

/**
 * The decisions, in order, that return a derivation from `after` to where it stood `before`, or
 * undefined when none can (a superseded one is decided through its revision). Only an accepted one
 * can be retracted, so getting back to retracted from anything else accepts first.
 */
const reversingDecisionsOf = (
  before: DecisionStanding,
  after: DerivationStatus,
): ReviewDecisionSequence | undefined => {
  switch (before.status) {
    case "pending":
      return [{ outcome: "reopen" }];
    case "accepted":
      return [reacceptOf(before)];
    case "rejected":
      return before.reason === undefined ? undefined : [{ outcome: "reject", reason: before.reason }];
    case "retracted":
      return after === "accepted" ? [{ outcome: "retract" }] : [reacceptOf(before), { outcome: "retract" }];
    default:
      return undefined;
  }
};

/**
 * Sends one decision; a refusal comes back as a failure for the card to show, never a retry.
 * `from` is the status it was decided on, so the session log can tell a changed reason from a rejection.
 */
const sendReviewDecision = async (target: string, input: ReviewDecisionInput, from: DerivationStatus | undefined) => {
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
      decisionId: decision.id,
      derivationId: derivation.id,
      kind: derivation.kind,
      statement: derivation.statement,
      from: from ?? null,
      status: derivation.status,
      reasonChanged: decision.outcome === "reject" && from === "rejected",
      effectiveScope: derivation.effectiveScope,
      at: decision.at,
    });
  }
  return outcome;
};

/** The decision just made here and the one that would take it back. */
export interface UndoableReviewDecision {
  /** The derivation it decided, which the undo is sent to. */
  readonly target: string;
  /** The decision record's id, so a caller can tell whether it is still the latest. */
  readonly decisionId: string;
  readonly outcome: DecisionOutcome;
  /** Where the derivation stands after it, which is what the reverse is decided on. */
  readonly status: DerivationStatus;
  readonly reverse: ReviewDecisionSequence;
}

/** Which derivation a decision is for and where it stands; a caller that picks it per decision passes it in. */
export interface ReviewDecisionSubject {
  readonly target: string;
  readonly standing?: DecisionStanding | undefined;
}

interface ReviewDecisionVariables {
  readonly target: string;
  readonly inputs: ReviewDecisionSequence;
  /** Set only when the decision can be undone. */
  readonly before: DecisionStanding | undefined;
  readonly from: DerivationStatus | undefined;
}

/**
 * Decides one derivation. Every query refreshes afterwards either way, so a card shows the store
 * as it now is; the failure stays on the card until cleared. Given where the derivation stands now,
 * a successful decision leaves `undoable` set until the next one, and `undo` writes its reverse.
 */
export function useReviewDecision(target: string, standing?: DecisionStanding) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<ReviewFailure | undefined>(undefined);
  const [undoable, setUndoable] = useState<UndoableReviewDecision | undefined>(undefined);
  const mutation = useMutation({
    // Several decisions only for an undo; it stops at the first refusal, which is the outcome shown.
    mutationFn: async ({ target: ref, inputs, from }: ReviewDecisionVariables) => {
      const [first, second] = inputs;
      const outcome = await sendReviewDecision(ref, first, from);
      return second === undefined || !outcome.ok
        ? outcome
        : sendReviewDecision(ref, second, outcome.value.derivation.status);
    },
    onMutate: () => {
      setFailure(undefined);
      setUndoable(undefined);
    },
    onSuccess: (outcome, { target: ref, before }) => {
      if (!outcome.ok) return setFailure(outcome.failure);
      const { decision, derivation } = outcome.value;
      const reverse = before === undefined ? undefined : reversingDecisionsOf(before, derivation.status);
      if (reverse !== undefined)
        setUndoable({
          target: ref,
          decisionId: decision.id,
          outcome: decision.outcome,
          status: derivation.status,
          reverse,
        });
    },
    onError: (error) => setFailure({ sentence: error.message, category: "broken", tag: "Network" }),
    onSettled: () => refreshReviewQueriesAfterWrite(queryClient, STORE_WRITE_STALES),
  });
  /*
   * The decision in flight, set synchronously: a double-click's second click arrives before the
   * button re-renders as loading, and would otherwise send the same decision twice. It gets the first one's outcome.
   */
  const inFlight = useRef<ReturnType<typeof mutation.mutateAsync> | undefined>(undefined);
  const send = (variables: ReviewDecisionVariables) => {
    if (inFlight.current !== undefined) return inFlight.current;
    const sent = mutation.mutateAsync(variables).finally(() => {
      inFlight.current = undefined;
    });
    inFlight.current = sent;
    return sent;
  };
  return {
    /** Decides `subject`, or the hook's own target when absent: a caller can pick the row in the same handler. */
    decide: (input: ReviewDecisionInput, subject: ReviewDecisionSubject = { target, standing }) =>
      send({ target: subject.target, inputs: [input], before: subject.standing, from: subject.standing?.status }),
    pending: mutation.isPending,
    failure,
    clearFailure: () => setFailure(undefined),
    undoable,
    /** Writes the reversing decision. It isn't itself undoable: the owner can just decide again. */
    undo: () =>
      undoable === undefined
        ? undefined
        : send({ target: undoable.target, inputs: undoable.reverse, before: undefined, from: undoable.status }),
  };
}
