/**
 * A pending proposal as one compact row of the inbox queue: a checkbox for bulk decisions, its statement,
 * where it would apply, who it is about, and icon chips for what deserves a second look. Selecting it
 * opens it in the detail pane, where it is decided on its own.
 */
import { Badge, Box, Checkbox, Group, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationScope } from "@tastebud/core/places";
import type { LucideIcon } from "lucide-react";
import type { MouseEvent, ReactNode, Ref } from "react";

import { ScopeChips } from "#review/shared/ui/place-chips.tsx";

const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    paddingInlineStart: "10px",
    borderRadius: "var(--mantine-radius-md)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--mantine-color-gray-3)",
    backgroundColor: "var(--mantine-color-white)",
    transitionProperty: "border-color, background-color",
    transitionDuration: "120ms",
  },
  selected: {
    borderColor: "var(--mantine-color-tastebud-4)",
    backgroundColor: "var(--mantine-color-tastebud-0)",
  },
  // Applied before `selected`, so the open row keeps its green edge when it is also checked.
  checked: { backgroundColor: "var(--mantine-color-blue-0)", borderColor: "var(--mantine-color-blue-3)" },
  // Shown on hover or focus, and on every row once one is checked, so a selection reads as a mode.
  check: {
    paddingTop: "9px",
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
      [stylex.when.ancestor(":focus-within")]: 1,
    },
  },
  checkShown: { opacity: 1 },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    flex: 1,
    minWidth: 0,
    paddingBlock: "6px",
    paddingInlineEnd: "10px",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "inherit",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
    // Scrolled into view below the shell header and the sticky group header (about 56px) over it.
    scrollMarginTop: "calc(var(--review-shell-header-height) + 64px)",
    scrollMarginBottom: "72px",
  },
  statement: { fontWeight: 600, lineHeight: 1.35 },
  // One line of chips; what doesn't fit is in the pane, which shows everything.
  details: { overflow: "hidden" },
});

/** A chip on a row for something worth a look before deciding; `caution` ones are worth reading first. */
export interface InboxRowFlag {
  readonly icon: LucideIcon;
  readonly text: string;
  readonly tooltip: string;
  readonly caution: boolean;
}

function InboxRowFlagChip({ flag }: { flag: InboxRowFlag }) {
  const Icon = flag.icon;
  return (
    <Tooltip label={flag.tooltip} withArrow openDelay={250}>
      <Badge
        size="md"
        tt="none"
        fw={500}
        color={flag.caution ? "orange" : "gray"}
        leftSection={<Icon size={11} strokeWidth={2} aria-hidden />}
      >
        {flag.text}
      </Badge>
    </Tooltip>
  );
}

/** A row's checkbox for bulk decisions. */
export interface InboxRowCheck {
  readonly checked: boolean;
  /** Some row is checked, so every row shows its checkbox. */
  readonly shown: boolean;
  /** `range` when shift was held: check the run from the last row checked. */
  readonly onCheck: (range: boolean) => void;
}

export function InboxProposalRow({
  statement,
  scope,
  subject,
  flags,
  selected,
  check,
  onSelect,
  ref,
}: {
  statement: string;
  /** Where it would apply now: the owner's edit if there is one, otherwise as proposed. */
  scope: DerivationScope | undefined;
  /** A chip for who it is about, when that isn't the owner. */
  subject: ReactNode;
  flags: ReadonlyArray<InboxRowFlag>;
  selected: boolean;
  check: InboxRowCheck;
  onSelect: () => void;
  ref?: Ref<HTMLButtonElement> | undefined;
}) {
  const { checked, onCheck } = check;
  return (
    <Box {...stylex.props(stylex.defaultMarker(), styles.row, checked && styles.checked, selected && styles.selected)}>
      <Box {...stylex.props(styles.check, (checked || check.shown) && styles.checkShown)}>
        <Checkbox
          size="xs"
          checked={checked}
          aria-label="Select for a bulk decision"
          // React fires a checkbox's change from its click, so the native event carries the shift key.
          onChange={(event) => onCheck("shiftKey" in event.nativeEvent && event.nativeEvent.shiftKey === true)}
        />
      </Box>
      <Box
        component="button"
        type="button"
        ref={ref}
        aria-current={selected}
        // Shift-click checks a range, as in a mail list, rather than opening the row.
        onClick={(event: MouseEvent) => (event.shiftKey ? onCheck(true) : onSelect())}
        {...stylex.props(styles.body)}
      >
        <Text size="sm" truncate="end" title={statement} {...stylex.props(styles.statement)}>
          {statement}
        </Text>
        <Group gap="2xs" wrap="nowrap" {...stylex.props(styles.details)}>
          {scope !== undefined && <ScopeChips scope={scope} linked={false} />}
          {subject}
          {flags.map((flag) => (
            <InboxRowFlagChip key={flag.tooltip} flag={flag} />
          ))}
        </Group>
      </Box>
    </Box>
  );
}
