/**
 * The bar under the queue for bulk decisions. While rows are checked it offers Believe them as proposed,
 * Reject them with one reason, or Clear, and a and r act through it. While a batch runs it counts it
 * off, and once it lands it holds the batch's Undo all. It sticks to the bottom of the queue so it
 * stays in reach while more rows are checked.
 */
import { Box, Button, Group, Kbd, Loader, Paper, Popover, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { Undo2 } from "lucide-react";
import { useState } from "react";

import { useReviewHotkeys } from "#review/shared/review-hotkeys.ts";

import { ignoringRepeatClicks } from "./inbox-decided-row.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import type { InboxBatchProgress, InboxBatchVerb } from "./use-inbox-batch.ts";

const styles = stylex.create({
  bar: { position: "sticky", bottom: "var(--mantine-spacing-md)", zIndex: 6 },
  // One height in every state, so the queue above doesn't jump as the bar changes: a default (sm)
  // Button's, as Mantine sizes it; its --button-height-sm is scoped to Button, so it is restated here.
  body: { minHeight: "calc(2.25rem * var(--mantine-scale))" },
  // The bar's own height (body, its xs padding, its 1px border) reserved below it, so at the queue's end
  // it can settle in place instead of riding its sticky offset up over the last row.
  spacer: { height: "calc(2.25rem * var(--mantine-scale) + 2 * var(--mantine-spacing-xs) + 2px)" },
  count: { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
});

const PROGRESS_VERBS: Record<InboxBatchVerb, string> = { believe: "Accepting", reject: "Rejecting" };
const DONE_WORDS: Record<InboxBatchVerb, string> = { believe: "accepted", reject: "rejected" };

interface InboxSelectionCounts {
  readonly checked: number;
  /** Checked rows that can be believed as proposed: not edited, overlapping or open mid-decision. */
  readonly believable: number;
  /** Checked rows not open mid-decision. */
  readonly rejectable: number;
}

/** What the bar is showing: a selection to act on, a batch running, or a batch landed with its Undo all. */
export type InboxSelectionBarState =
  | {
      readonly stage: "selecting";
      readonly counts: InboxSelectionCounts;
      readonly onBelieve: () => void;
      readonly onReject: (reason: string) => void;
      readonly onClear: () => void;
    }
  | { readonly stage: "running"; readonly progress: InboxBatchProgress }
  | { readonly stage: "done"; readonly verb: InboxBatchVerb; readonly count: number; readonly onUndoAll: () => void };

function SelectingBar({
  kind,
  state,
}: {
  kind: DerivedKindView;
  state: Extract<InboxSelectionBarState, { stage: "selecting" }>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const { checked, believable, rejectable } = state.counts;
  const leftOut = checked - believable;
  // The selection owns a and r while it exists; the open row's own a and r stand down (see the pane).
  useReviewHotkeys([
    { hotkey: "A", callback: () => believable > 0 && state.onBelieve(), options: { enabled: !rejecting } },
    { hotkey: "R", callback: () => rejectable > 0 && setRejecting(true), options: { enabled: !rejecting } },
  ]);
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm" {...stylex.props(styles.body)}>
      <Text size="sm" fw={600} {...stylex.props(styles.count)}>
        {checked} selected
      </Text>
      <Group gap="xs" wrap="nowrap">
        <Tooltip
          label={
            <>
              Clear <Kbd size="xs">Esc</Kbd>
            </>
          }
          withArrow
        >
          <Button variant="subtle" color="gray" onClick={state.onClear}>
            Clear
          </Button>
        </Tooltip>
        <Popover
          opened={rejecting}
          onChange={setRejecting}
          width={460}
          position="top-end"
          withArrow
          shadow="md"
          trapFocus
          returnFocus
        >
          <Popover.Target>
            <Button variant="default" disabled={rejectable === 0} onClick={() => setRejecting((open) => !open)}>
              Reject {rejectable}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <RejectReasonForm
              pending={false}
              onSubmit={(reason) => {
                setRejecting(false);
                state.onReject(reason);
              }}
              onCancel={() => setRejecting(false)}
            />
          </Popover.Dropdown>
        </Popover>
        <Tooltip
          label={
            leftOut === 0 ? (
              <>
                {kind.acceptLabel} all <Kbd size="xs">A</Kbd>
              </>
            ) : (
              `${leftOut} edited, overlapping or open stay selected, to decide one by one`
            )
          }
          withArrow
        >
          <Button disabled={believable === 0} onClick={state.onBelieve}>
            {kind.acceptLabel} {believable} as proposed
          </Button>
        </Tooltip>
      </Group>
    </Group>
  );
}

export function InboxSelectionBar({ kind, state }: { kind: DerivedKindView; state: InboxSelectionBarState }) {
  return (
    <>
      <Paper withBorder shadow="md" px="sm" py="xs" {...stylex.props(styles.bar)}>
        {state.stage === "selecting" && <SelectingBar kind={kind} state={state} />}
        {state.stage === "running" && (
          <Group gap="xs" wrap="nowrap" {...stylex.props(styles.body)}>
            <Loader size="xs" />
            <Text size="sm" fw={600} {...stylex.props(styles.count)}>
              {PROGRESS_VERBS[state.progress.verb]} {state.progress.at} of {state.progress.total}…
            </Text>
          </Group>
        )}
        {state.stage === "done" && (
          <Group justify="space-between" wrap="nowrap" gap="sm" {...stylex.props(styles.body)}>
            <Text size="sm" fw={600} {...stylex.props(styles.count)}>
              {state.count} {DONE_WORDS[state.verb]}
            </Text>
            <Tooltip
              label={
                <>
                  Undo all <Kbd size="xs">U</Kbd>
                </>
              }
              withArrow
            >
              <Button
                variant="default"
                leftSection={<Undo2 size={14} />}
                onClick={ignoringRepeatClicks(state.onUndoAll)}
              >
                Undo all
              </Button>
            </Tooltip>
          </Group>
        )}
      </Paper>
      <Box aria-hidden {...stylex.props(styles.spacer)} />
    </>
  );
}
