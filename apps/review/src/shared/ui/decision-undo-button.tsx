/**
 * Undo for a decision just made, the same button wherever one is shown. The caller decides whether it
 * shows: only while that decision is still the newest on record (`useReviewDecision`'s `canUndo`).
 * `undoKey` binds U, on the one Undo that owns the key.
 */
import { Button, Tooltip } from "@mantine/core";
import { Undo2 } from "lucide-react";

import { useReviewHotkeys } from "#review/shared/review-hotkeys.ts";

import { ignoringRepeatClicks } from "./ignoring-repeat-clicks.ts";

/** Mounted only while U should act, so a hidden or busy Undo never takes the key. */
function UndoHotkey({ onUndo }: { onUndo: () => void }) {
  useReviewHotkeys([{ hotkey: "U", callback: onUndo }]);
  return null;
}

export function DecisionUndoButton({
  undoing,
  onUndo,
  undoKey,
}: {
  undoing: boolean;
  onUndo: () => void;
  /** What U does here, when this Undo owns the key: a batch's last row undoes the whole batch. */
  undoKey?: (() => void) | undefined;
}) {
  return (
    <>
      {undoKey !== undefined && !undoing && <UndoHotkey onUndo={undoKey} />}
      <Tooltip
        label={undoKey === undefined ? "Undo the decision just made" : "Undo the decision just made · U"}
        withArrow
      >
        <Button
          variant="default"
          leftSection={<Undo2 size={14} />}
          loading={undoing}
          onClick={ignoringRepeatClicks(onUndo)}
        >
          Undo
        </Button>
      </Tooltip>
    </>
  );
}
