/**
 * A pending proposal as one row of the inbox's list: a checkbox slot (shown on hover or while rows are
 * checked), its statement, and chips only for what sets it apart: a scope other than its section's, who
 * it is about, cautions and notes. Selecting it opens it in the detail pane, where it is decided.
 */
import { Box, Checkbox, Group, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationScope } from "@tastebud/core/places";
import type { LucideIcon } from "lucide-react";
import type { MouseEvent, ReactNode, Ref } from "react";

import { CautionChip, type DerivationCaution } from "#review/shared/ui/caution-chip.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { NeutralMarkChip } from "#review/shared/ui/status-chips.tsx";

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
  // Empty at rest: the tab above already names the kind, so a glyph here would repeat it on every row.
  lead: {
    display: "grid",
    placeItems: "center",
    width: "16px",
    height: "16px",
    marginTop: "10px",
    flexShrink: 0,
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
      [stylex.when.ancestor(":focus-within")]: 1,
    },
  },
  // Selection mode: every row shows its checkbox, so what is checked reads at a glance.
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

/** A neutral mark on a row: a fact about it (queued, edited, notes), not a caution. */
export interface InboxRowNote {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly tooltip: string;
}

/** What a row shows under its statement; each part is left out when it says nothing new. */
export interface InboxRowChips {
  /** Where it would apply, only when that differs from its section's scope. */
  readonly scope: DerivationScope | undefined;
  /** A chip for who it is about, when that isn't the owner. */
  readonly subject: ReactNode;
  readonly cautions: ReadonlyArray<DerivationCaution>;
  readonly notes: ReadonlyArray<InboxRowNote>;
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
  chips,
  selected,
  check,
  onSelect,
  ref,
}: {
  statement: string;
  chips: InboxRowChips;
  selected: boolean;
  check: InboxRowCheck;
  onSelect: () => void;
  ref?: Ref<HTMLButtonElement> | undefined;
}) {
  const { checked, onCheck } = check;
  const selecting = checked || check.shown;
  const hasChips =
    chips.scope !== undefined || chips.subject !== null || chips.cautions.length > 0 || chips.notes.length > 0;
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
      <Box {...stylex.props(styles.lead, selecting && styles.checkShown)}>
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
        <Text size="sm" lineClamp={2} title={statement} {...stylex.props(styles.statement)}>
          {statement}
        </Text>
        {hasChips && (
          <Group gap="2xs" wrap="nowrap" {...stylex.props(styles.details)}>
            {chips.scope !== undefined && <ScopeChips scope={chips.scope} linked={false} />}
            {chips.subject}
            {chips.cautions.map((caution) => (
              <CautionChip key={caution} caution={caution} />
            ))}
            {chips.notes.map((note) => (
              <NeutralMarkChip key={note.tooltip} {...note} />
            ))}
          </Group>
        )}
      </Box>
    </Box>
  );
}
