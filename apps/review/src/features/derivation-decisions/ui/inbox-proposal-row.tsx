/**
 * A pending proposal as one compact row of the inbox queue: its statement, where it would apply, and
 * what deserves a second look, in words. It has no buttons; selecting it opens it in the detail pane,
 * where it is decided.
 */
import { Box, Group, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationScope } from "@tastebud/core/places";
import type { Ref } from "react";

import { ScopeChips } from "#review/shared/ui/place-chips.tsx";

const styles = stylex.create({
  row: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    width: "100%",
    paddingBlock: "6px",
    paddingInline: "10px",
    borderRadius: "var(--mantine-radius-md)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--mantine-color-gray-3)",
    backgroundColor: "var(--mantine-color-white)",
    textAlign: "left",
    cursor: "pointer",
    transitionProperty: "border-color, background-color",
    transitionDuration: "120ms",
    // Scrolled into view below the shell header and the sticky group header (about 56px) over it.
    scrollMarginTop: "calc(var(--review-shell-header-height) + 64px)",
    scrollMarginBottom: "24px",
  },
  selected: {
    borderColor: "var(--mantine-color-tastebud-4)",
    backgroundColor: "var(--mantine-color-tastebud-0)",
  },
  statement: { fontWeight: 600, lineHeight: 1.35 },
  // One line of chips and flags; what doesn't fit is in the pane, which shows everything.
  details: { overflow: "hidden" },
});

/** A word flag on a row; `caution` ones are worth reading before believing. */
export interface InboxRowFlag {
  readonly text: string;
  readonly caution: boolean;
}

export function InboxProposalRow({
  statement,
  scope,
  flags,
  selected,
  onSelect,
  ref,
}: {
  statement: string;
  /** Where it would apply now: the owner's edit if there is one, otherwise as proposed. */
  scope: DerivationScope | undefined;
  flags: ReadonlyArray<InboxRowFlag>;
  selected: boolean;
  onSelect: () => void;
  ref?: Ref<HTMLButtonElement> | undefined;
}) {
  return (
    <Box
      component="button"
      type="button"
      ref={ref}
      aria-current={selected}
      onClick={onSelect}
      {...stylex.props(styles.row, selected && styles.selected)}
    >
      <Text size="sm" truncate="end" title={statement} {...stylex.props(styles.statement)}>
        {statement}
      </Text>
      <Group gap="xs" wrap="nowrap" {...stylex.props(styles.details)}>
        {scope !== undefined && <ScopeChips scope={scope} linked={false} />}
        {flags.map((flag) => (
          <Text key={flag.text} size="xs" c={flag.caution ? "orange.8" : "dimmed"} span>
            {flag.text}
          </Text>
        ))}
      </Group>
    </Box>
  );
}
