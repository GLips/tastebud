/**
 * A pending proposal as one row of the inbox's list: its kind glyph (a checkbox on hover or while rows are
 * checked), its statement, and chips only for what sets it apart: a scope other than its section's, who
 * it is about, cautions and notes. Selecting it opens it in the detail pane, where it is decided.
 */
import { Badge, Box, Checkbox, Group, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationScope } from "@tastebud/core/places";
import type { LucideIcon } from "lucide-react";
import type { MouseEvent, ReactNode, Ref } from "react";

import { ScopeChips } from "#review/shared/ui/place-chips.tsx";

import { inboxListStyles } from "./inbox-list-styles.ts";

const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    // A clear left edge on every row, so the open row's accent takes no width from the rest.
    paddingInlineStart: "9px",
    borderInlineStartWidth: "3px",
    borderInlineStartStyle: "solid",
    borderInlineStartColor: "transparent",
    backgroundColor: { default: "var(--mantine-color-white)", ":hover": "var(--mantine-color-gray-0)" },
    transitionProperty: "background-color",
    transitionDuration: "120ms",
  },
  checked: { backgroundColor: { default: "var(--mantine-color-blue-0)", ":hover": "var(--mantine-color-blue-0)" } },
  // Applied after `checked`: the open row keeps its accent and tint when it is also checked.
  selected: {
    backgroundColor: { default: "var(--mantine-color-tastebud-0)", ":hover": "var(--mantine-color-tastebud-0)" },
    borderInlineStartColor: "var(--mantine-color-tastebud-5)",
  },
  // The glyph and the checkbox share one cell, so the row never carries an empty checkbox column.
  lead: { display: "grid", placeItems: "center", width: "16px", height: "16px", marginTop: "10px", flexShrink: 0 },
  layer: { gridArea: "1 / 1" },
  glyph: {
    opacity: {
      default: 1,
      [stylex.when.ancestor(":hover")]: 0,
      [stylex.when.ancestor(":focus-within")]: 0,
    },
  },
  check: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
      [stylex.when.ancestor(":focus-within")]: 1,
    },
  },
  // Selection mode: every row shows its checkbox, so what is checked reads at a glance.
  glyphHidden: { opacity: 0 },
  checkShown: { opacity: 1 },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    flex: 1,
    minWidth: 0,
    paddingBlock: "8px",
    paddingInlineEnd: "12px",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "inherit",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
    // Scrolled into view below the shell header and the sticky section header over it.
    scrollMarginTop: "calc(var(--review-shell-header-height) + 48px)",
    scrollMarginBottom: "72px",
  },
  statement: { fontWeight: 600, lineHeight: 1.35 },
  details: { overflow: "hidden" },
});

/** A chip on a row for something worth a look before deciding; `caution` ones are worth reading first. */
export interface InboxRowFlag {
  readonly icon: LucideIcon;
  readonly text: string;
  readonly tooltip: string;
  readonly caution: boolean;
}

/** What a row shows under its statement; each part is left out when it says nothing new. */
export interface InboxRowChips {
  /** Where it would apply, only when that differs from its section's scope. */
  readonly scope: DerivationScope | undefined;
  /** A chip for who it is about, when that isn't the owner. */
  readonly subject: ReactNode;
  readonly flags: ReadonlyArray<InboxRowFlag>;
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
  glyph,
  chips,
  selected,
  check,
  onSelect,
  ref,
}: {
  statement: string;
  /** The kind's glyph, which the checkbox replaces on hover and in selection mode. */
  glyph: ReactNode;
  chips: InboxRowChips;
  selected: boolean;
  check: InboxRowCheck;
  onSelect: () => void;
  ref?: Ref<HTMLButtonElement> | undefined;
}) {
  const { checked, onCheck } = check;
  const selecting = checked || check.shown;
  const hasChips = chips.scope !== undefined || chips.subject !== null || chips.flags.length > 0;
  return (
    <Box
      {...stylex.props(
        stylex.defaultMarker(),
        inboxListStyles.divided,
        styles.row,
        checked && styles.checked,
        selected && styles.selected,
      )}
    >
      <Box {...stylex.props(styles.lead)}>
        <Box {...stylex.props(styles.layer, styles.glyph, selecting && styles.glyphHidden)}>{glyph}</Box>
        <Box {...stylex.props(styles.layer, styles.check, selecting && styles.checkShown)}>
          <Checkbox
            size="xs"
            checked={checked}
            aria-label="Select for a bulk decision"
            // React fires a checkbox's change from its click, so the native event carries the shift key.
            onChange={(event) => onCheck("shiftKey" in event.nativeEvent && event.nativeEvent.shiftKey === true)}
          />
        </Box>
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
        <Text size="sm" lineClamp={2} title={statement} {...stylex.props(styles.statement)}>
          {statement}
        </Text>
        {hasChips && (
          <Group gap="2xs" wrap="nowrap" {...stylex.props(styles.details)}>
            {chips.scope !== undefined && <ScopeChips scope={chips.scope} linked={false} />}
            {chips.subject}
            {chips.flags.map((flag) => (
              <InboxRowFlagChip key={flag.tooltip} flag={flag} />
            ))}
          </Group>
        )}
      </Box>
    </Box>
  );
}
