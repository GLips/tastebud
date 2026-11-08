/**
 * A card decided here, folded to its outcome where it stood, so the reviewer sees what happened and
 * can take it back. Undo shows only while that decision is still the newest on record: once
 * anything else decides it, undoing would overwrite a decision this row never saw.
 */
import { Badge, Button, Group, Paper, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import type { MouseEvent } from "react";

import { recordDetailQuery } from "#review/features/review-shell/index.ts";
import { ButtonLink } from "#review/shared/ui/router-links.tsx";

import { DECISION_OUTCOME_LABELS } from "./review-session-list.tsx";
import type { UndoableReviewDecision } from "./use-review-decision.ts";

const styles = stylex.create({
  row: { backgroundColor: "var(--mantine-color-gray-0)" },
  shrinkable: { minWidth: 0, flex: 1 },
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

/** Mounted only on the newest decision's row, so `u` takes back exactly one thing. */
function UndoLatestHotkey({ onUndo }: { onUndo: () => void }) {
  useHotkeys([{ hotkey: "U", callback: onUndo }]);
  return null;
}

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
  /** The newest decision made in the inbox, which `u` undoes. */
  latest: boolean;
}) {
  const detail = useQuery(recordDetailQuery(id));
  const latestId = detail.data?.derivation?.decisions.at(-1)?.id;
  const canUndo = undoable !== undefined && latestId === undoable.decisionId;
  const outcome = undoable === undefined ? undefined : DECISION_OUTCOME_LABELS[undoable.outcome];
  return (
    <Paper px="md" py="xs" {...stylex.props(styles.row)}>
      {canUndo && latest && !undoing && <UndoLatestHotkey onUndo={onUndo} />}
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Group gap="xs" wrap="nowrap" {...stylex.props(styles.shrinkable)}>
          {outcome !== undefined && (
            <Badge size="sm" color={outcome.color}>
              {outcome.word}
            </Badge>
          )}
          <Text size="sm" c="dimmed" truncate>
            {statement}
          </Text>
        </Group>
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
    </Paper>
  );
}
