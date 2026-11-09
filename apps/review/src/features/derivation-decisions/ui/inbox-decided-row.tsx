/**
 * A card decided here, folded to its outcome where it stood, so the reviewer sees what happened and
 * can take it back. A batch's Undo all lives in the selection bar; its last row carries the `u` key
 * that does the same.
 */
import { Box } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { recordDetailQuery } from "#review/features/review-shell/index.ts";
import { DecisionOutcomeLine } from "#review/shared/ui/decision-outcome.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { ButtonLink } from "#review/shared/ui/router-links.tsx";

import { inboxListStyles } from "./inbox-list-styles.ts";
import type { UndoableReviewDecision } from "./use-review-decision.ts";

const styles = stylex.create({
  row: { paddingBlock: "6px", paddingInline: "12px", backgroundColor: "var(--mantine-color-gray-0)" },
});

/** How a row belongs to the newest decision: whether it is its last card, and the batch's Undo all if any. */
export type InboxDecidedRowLatest = {
  last: boolean;
  onUndoAll: (() => void) | undefined;
};

export function InboxDecidedRow({
  id,
  statement,
  undoable,
  canUndo,
  undoing,
  onUndo,
  latest,
}: {
  id: string;
  statement: string;
  /** The decision made here and its reverse; undefined once it has been undone or was never made here. */
  undoable: UndoableReviewDecision | undefined;
  /** Whether that decision is still the newest on record. */
  canUndo: boolean;
  undoing: boolean;
  onUndo: () => void;
  /** Set while part of the newest decision made in the inbox, which `u` undoes with the rest of its batch. */
  latest: InboxDecidedRowLatest | undefined;
}) {
  // Where it was believed, read back from the store, so a batch or an edited scope reads the same.
  const detail = useQuery({ ...recordDetailQuery(id), enabled: undoable?.outcome === "accept" });
  const acceptedScope = undoable?.outcome === "accept" ? detail.data?.derivation?.effectiveScope : undefined;
  return (
    <Box {...stylex.props(inboxListStyles.divided, styles.row)}>
      <DecisionOutcomeLine
        status={undoable?.status}
        statement={statement}
        scope={acceptedScope && <ScopeChips scope={acceptedScope} linked={false} wrap="wrap" />}
        undo={
          canUndo
            ? { undoing, onUndo, undoKey: latest?.last === true ? (latest.onUndoAll ?? onUndo) : undefined }
            : undefined
        }
        actions={
          <ButtonLink to="/derivations/$id" params={{ id }} variant="subtle" color="gray">
            View
          </ButtonLink>
        }
      />
    </Box>
  );
}
