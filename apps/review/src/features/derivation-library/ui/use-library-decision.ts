import { useQueryClient } from "@tanstack/react-query";
import type { DerivationRow } from "@tastebud/core/record-browsing";
import type { DecisionOutcome } from "@tastebud/core/taste-vocabulary";
import { useState } from "react";

import { acceptPreviewQuery, useReviewDecision } from "#review/features/derivation-decisions/index.ts";

/** A library decision as a row asks for it; the page sends it and keeps its Undo. */
export interface LibraryDecisionRequest {
  readonly outcome: DecisionOutcome;
  readonly reason?: string;
  /** The overlapping near repeats the person looked over before accepting anyway. */
  readonly acknowledges?: ReadonlyArray<string>;
}

/**
 * The library's one decision, at page level so its outcome and Undo survive the row leaving the filter. A row
 * becomes the target when its menu opens or its reject reason takes focus: the hook binds its target at render.
 * An accept checks the preview first, so an overlap is shown in the row instead of refused by the server.
 */
export function useLibraryDecision() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<DerivationRow | undefined>(undefined);
  const [decided, setDecided] = useState<DerivationRow | undefined>(undefined);
  const [overlapping, setOverlapping] = useState<string | undefined>(undefined);
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
      setOverlapping(undefined);
      decision.clearFailure();
    },
    decide: async (row: DerivationRow, request: LibraryDecisionRequest) => {
      if (row.id !== target?.id) return;
      if (request.outcome === "accept" && request.acknowledges === undefined) {
        const preview = await queryClient.fetchQuery(acceptPreviewQuery(row.id, undefined));
        if (preview.needsAcknowledgement.length > 0) return setOverlapping(row.id);
      }
      const outcome = await decision.decide(request);
      if (!outcome.ok) return;
      setDecided(row);
      setOverlapping(undefined);
    },
    decidingId: decision.pending ? target?.id : undefined,
    /** The row whose accept is waiting on its overlaps being looked over. */
    overlappingId: overlapping,
    cancelAccept: () => setOverlapping(undefined),
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
