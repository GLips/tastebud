/**
 * The bar that appears once rows are checked: how many, Believe them as proposed, Reject them with one
 * reason, or Clear. It sticks to the bottom of the queue so it stays in reach while more rows are checked.
 */
import { Button, Group, Kbd, Paper, Popover, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { useState } from "react";

import { RejectReasonForm } from "./reject-reason-form.tsx";

const styles = stylex.create({
  bar: { position: "sticky", bottom: "16px", zIndex: 6 },
  count: { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
});

interface InboxSelectionCounts {
  readonly checked: number;
  /** Checked rows that can be believed as proposed: not edited, overlapping or open mid-decision. */
  readonly believable: number;
  /** Checked rows not open mid-decision. */
  readonly rejectable: number;
}

export function InboxSelectionBar({
  kind,
  counts,
  pending,
  onBelieve,
  onReject,
  onClear,
}: {
  kind: DerivedKindView;
  counts: InboxSelectionCounts;
  pending: boolean;
  onBelieve: () => void;
  onReject: (reason: string) => void;
  onClear: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const { checked: checkedCount, believable: believableCount, rejectable: rejectableCount } = counts;
  const leftOut = checkedCount - believableCount;
  return (
    <Paper withBorder shadow="md" px="sm" py="xs" {...stylex.props(styles.bar)}>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm" fw={600} {...stylex.props(styles.count)}>
          {checkedCount} selected
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
            <Button variant="subtle" color="gray" onClick={onClear} disabled={pending}>
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
          >
            <Popover.Target>
              <Button
                variant="default"
                disabled={rejectableCount === 0 || pending}
                onClick={() => setRejecting((open) => !open)}
              >
                Reject {rejectableCount}…
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <RejectReasonForm
                pending={false}
                onSubmit={(reason) => {
                  setRejecting(false);
                  onReject(reason);
                }}
                onCancel={() => setRejecting(false)}
              />
            </Popover.Dropdown>
          </Popover>
          <Tooltip
            label={`${leftOut} edited, overlapping or open stay selected, to decide one by one`}
            disabled={leftOut === 0}
            withArrow
          >
            <Button disabled={believableCount === 0} loading={pending} onClick={onBelieve}>
              {kind.acceptLabel} {believableCount} as proposed
            </Button>
          </Tooltip>
        </Group>
      </Group>
    </Paper>
  );
}
