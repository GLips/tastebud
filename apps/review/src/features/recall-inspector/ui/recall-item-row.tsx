/**
 * One item in the recall inspector, as a table row: its statement, scope and status and, for a prompt's answer,
 * what Recall did with it and why. Every row shares the columns, so outcomes read straight down. The whole row
 * opens the item; its statement stays the link for keyboards.
 */
import { Box, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import type { DerivationSummary } from "@tastebud/core/record-views";
import type { MouseEvent } from "react";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { RecallOutcomeChip } from "#review/shared/ui/outcome-chip.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DerivationStatusBadge } from "#review/shared/ui/status-chips.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import type { RecallOutcome } from "./recall-reasons.ts";

const styles = stylex.create({
  row: {
    display: "grid",
    gridTemplateColumns: "12px minmax(0, 1.5fr) 160px 108px 108px minmax(0, 1fr)",
    columnGap: "12px",
    alignItems: "baseline",
    paddingBlock: "8px",
    paddingInline: "6px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: { default: "var(--mantine-color-gray-1)", ":first-child": "transparent" },
  },
  clickable: {
    cursor: "pointer",
    backgroundColor: { default: "transparent", ":hover": "var(--mantine-color-gray-0)" },
  },
  head: { paddingBlock: "2px" },
  scope: { minWidth: 0, overflow: "hidden" },
});

const COLUMN_TITLES = ["Scope", "Status", "Outcome", "Why"];

function RecallTableHead() {
  return (
    <Box {...stylex.props(styles.row, styles.head)} aria-hidden>
      <Box />
      <Box />
      {COLUMN_TITLES.map((title) => (
        <Text key={title} size="xs" c="dimmed" fw={500}>
          {title}
        </Text>
      ))}
    </Box>
  );
}

function RecallItemRowBody({ item, outcome }: { item: DerivationSummary; outcome?: RecallOutcome }) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const navigate = useNavigate();
  // The statement's own link has already navigated (and prevented the default) when the click landed on it.
  const open = (event: MouseEvent) => {
    if (!event.defaultPrevented) void navigate({ to: "/derivations/$id", params: { id: item.id } });
  };
  return (
    <Box {...stylex.props(styles.row, styles.clickable)} onClick={open}>
      <KindGlyph catalog={catalog} kind={item.kind} label={item.kindLabel} size={10} />
      <AnchorLink to="/derivations/$id" params={{ id: item.id }} c="inherit" size="sm" underline="hover">
        {item.statement}
      </AnchorLink>
      <Box {...stylex.props(styles.scope)}>
        <ScopeChips scope={item.effectiveScope} labels={known.labels} wrap="wrap" />
      </Box>
      <Box>
        <DerivationStatusBadge status={item.status} />
      </Box>
      <Box>
        {outcome !== undefined && <RecallOutcomeChip outcome={outcome.tone}>{outcome.label}</RecallOutcomeChip>}
      </Box>
      {outcome?.why === undefined ? <Box /> : <SupportingText tier="secondary">{outcome.why}</SupportingText>}
    </Box>
  );
}

/** A row, and `RecallItemRow.Head`, the column labels a table of rows starts with. */
export const RecallItemRow = Object.assign(RecallItemRowBody, { Head: RecallTableHead });
