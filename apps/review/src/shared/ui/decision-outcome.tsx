/**
 * What a decision just made did, as one line: the status it left, what was decided, and Undo while
 * it can still be taken back. The inbox folds a decided card to it and the library floats it over
 * the list, so both read and undo a decision the same way.
 */
import { Box, Group, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationStatus } from "@tastebud/core/taste-vocabulary";
import type { ReactNode } from "react";

import { DecisionUndoButton } from "./decision-undo-button.tsx";
import { DerivationStatusBadge } from "./status-chips.tsx";

const styles = stylex.create({
  body: { minWidth: 0, flex: 1 },
  noShrink: { flexShrink: 0 },
});

export function DecisionOutcomeLine({
  status,
  statement,
  scope,
  undo,
  actions,
}: {
  /** Where the derivation stands after the decision; unknown for one decided before this page loaded. */
  status: DerivationStatus | undefined;
  statement: string;
  /** Where it now applies, beside the badge, when the decision set that. */
  scope?: ReactNode;
  /** Undo's state; left out once the decision is no longer the newest. */
  undo?: { undoing: boolean; onUndo: () => void; undoKey?: (() => void) | undefined } | undefined;
  /** Trailing links after Undo, such as View. */
  actions?: ReactNode;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm">
      <Stack gap="3xs" {...stylex.props(styles.body)}>
        {/* The scope wraps in its own column beside the badge, so a long one never leaves the badge alone. */}
        <Group gap="xs" wrap="nowrap" align="flex-start">
          {status !== undefined && (
            <Box {...stylex.props(styles.noShrink)}>
              <DerivationStatusBadge status={status} />
            </Box>
          )}
          {scope !== undefined && <Box {...stylex.props(styles.body)}>{scope}</Box>}
        </Group>
        <Text size="sm" c="dimmed" lineClamp={2}>
          {statement}
        </Text>
      </Stack>
      <Group gap="2xs" wrap="nowrap" {...stylex.props(styles.noShrink)}>
        {undo !== undefined && <DecisionUndoButton {...undo} />}
        {actions}
      </Group>
    </Group>
  );
}
