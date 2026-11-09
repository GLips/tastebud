/**
 * A card decided here, folded to its outcome where it stood, so the reviewer sees what happened and
 * can take it back. Undo shows only while that decision is still the newest on record: once
 * anything else decides it, undoing would overwrite a decision this row never saw. A batch's Undo
 * all lives in the selection bar; its last row carries the `u` key that does the same.
 */
import { Box, Button, Group, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import type { MouseEvent } from "react";

import { recordDetailQuery } from "#review/features/review-shell/index.ts";
import { useReviewHotkeys } from "#review/shared/review-hotkeys.ts";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { ButtonLink } from "#review/shared/ui/router-links.tsx";
import { DerivationStatusBadge } from "#review/shared/ui/status-chips.tsx";

import { inboxListStyles } from "./inbox-list-styles.ts";
import type { UndoableReviewDecision } from "./use-review-decision.ts";

const styles = stylex.create({
  row: { paddingBlock: "6px", paddingInline: "12px", backgroundColor: "var(--mantine-color-gray-0)" },
  shrinkable: { minWidth: 0, flex: 1 },
  noShrink: { flexShrink: 0 },
});

/**
 * A click handler that ignores the second click of a double click. Deciding folds a card and Undo
 * unfolds it, so whatever lands under the cursor must not take a click meant for the button before.
 */
export const ignoringRepeatClicks =
  (onClick: () => void) =>
  (event: MouseEvent): void => {
    if (event.detail <= 1) onClick();
  };

/** Mounted only on the newest decision's last row, so `u` takes back exactly one decision or batch. */
function UndoLatestHotkey({ onUndo }: { onUndo: () => void }) {
  useReviewHotkeys([{ hotkey: "U", callback: onUndo }]);
  return null;
}

/** How a row belongs to the newest decision: whether it is its last card, and the batch's Undo all if any. */
export type InboxDecidedRowLatest = {
  last: boolean;
  onUndoAll: (() => void) | undefined;
};

export function InboxDecidedRow({
  id,
  statement,
  undoable,
  undoing,
  onUndo,
  latest,
}: {
  id: string;
  statement: string;
  /** The decision made here and its reverse; undefined once it has been undone or was never made here. */
  undoable: UndoableReviewDecision | undefined;
  undoing: boolean;
  onUndo: () => void;
  /** Set while part of the newest decision made in the inbox, which `u` undoes with the rest of its batch. */
  latest: InboxDecidedRowLatest | undefined;
}) {
  const detail = useQuery(recordDetailQuery(id));
  const latestId = detail.data?.derivation?.decisions.at(-1)?.id;
  const canUndo = undoable !== undefined && latestId === undoable.decisionId;
  // Where it was believed, read back from the store, so a batch or an edited scope reads the same.
  const acceptedScope = undoable?.outcome === "accept" ? detail.data?.derivation?.effectiveScope : undefined;
  return (
    <Box {...stylex.props(inboxListStyles.divided, styles.row)}>
      {canUndo && latest?.last === true && !undoing && <UndoLatestHotkey onUndo={latest.onUndoAll ?? onUndo} />}
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Stack gap="3xs" {...stylex.props(styles.shrinkable)}>
          {/* Its place chips wrap within their own column beside the badge, so a long scope never leaves the badge alone. */}
          <Group gap="xs" wrap="nowrap" align="flex-start">
            {undoable !== undefined && (
              <Box {...stylex.props(styles.noShrink)}>
                <DerivationStatusBadge status={undoable.status} />
              </Box>
            )}
            {acceptedScope !== undefined && (
              <Box {...stylex.props(styles.shrinkable)}>
                <ScopeChips scope={acceptedScope} linked={false} wrap="wrap" />
              </Box>
            )}
          </Group>
          <Text size="sm" c="dimmed" lineClamp={2}>
            {statement}
          </Text>
        </Stack>
        <Group gap="2xs" wrap="nowrap">
          {canUndo && (
            <Button
              variant="default"
              leftSection={<Undo2 size={14} />}
              loading={undoing}
              onClick={ignoringRepeatClicks(onUndo)}
            >
              Undo
            </Button>
          )}
          <ButtonLink to="/derivations/$id" params={{ id }} variant="subtle" color="gray">
            View
          </ButtonLink>
        </Group>
      </Group>
    </Box>
  );
}
