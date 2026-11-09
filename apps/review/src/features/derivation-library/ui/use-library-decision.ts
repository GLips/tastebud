import type { DerivationRow } from "@tastebud/core/record-browsing";
import type { DecisionOutcome } from "@tastebud/core/taste-vocabulary";
import { useState } from "react";

import { useReviewDecision } from "#review/features/derivation-decisions/index.ts";

/** A library decision as a row asks for it; the page sends it and keeps its Undo. */
export interface LibraryDecisionRequest {
  readonly outcome: DecisionOutcome;
  readonly reason?: string;
}

/**
 * The library's one decision, at page level so its outcome and Undo survive the row leaving the filter or
 * moving section. A row becomes the target when its menu opens (or its reject reason takes focus), which binds
 * the decision hook to it before an action is picked; the hook takes its target at render, not per call.
 */
export function useLibraryDecision() {
  const [target, setTarget] = useState<DerivationRow | undefined>(undefined);
  const [decided, setDecided] = useState<DerivationRow | undefined>(undefined);
  const decision = useReviewDecision(
    target?.id ?? "",
    target === undefined
      ? undefined
      : {
          status: target.status,
          proposedScope: target.proposedScope,
          effectiveScope: target.effectiveScope,
          reason: target.reason,
        },
  );
  return {
    /** Makes `row` the target. Another row's Undo goes with it: the hook can only undo its own target. */
    activate: (row: DerivationRow) => {
      if (row.id === target?.id) return;
      setTarget(row);
      setDecided(undefined);
      decision.clearFailure();
    },
    decide: async (row: DerivationRow, request: LibraryDecisionRequest) => {
      if (row.id !== target?.id) return;
      const outcome = await decision.decide(request);
      if (outcome.ok) setDecided(row);
    },
    decidingId: decision.pending ? target?.id : undefined,
    /** The row just decided and the decision that undoes it, while it can still be undone. */
    undoable:
      decided !== undefined && decision.undoable !== undefined
        ? { row: decided, outcome: decision.undoable.outcome }
        : undefined,
    undo: async () => {
      await decision.undo();
      setDecided(undefined);
    },
    undoing: decision.pending,
    failure: decision.failure === undefined || target === undefined ? undefined : { row: target, ...decision.failure },
  };
}
