/**
 * One item in the recall inspector, as a table row: its statement, its scope, and, for a prompt's answer,
 * an outcome chip with a short why. Every row shares the columns, so outcomes read straight down.
 */
import { Badge, Box, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationSummary } from "@tastebud/core/record-views";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import type { RecallOutcome } from "./recall-reasons.ts";

const styles = stylex.create({
  row: {
    display: "grid",
    gridTemplateColumns: "12px minmax(0, 1fr) 190px 130px minmax(0, 220px)",
    columnGap: "12px",
    alignItems: "baseline",
    paddingBlock: "8px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: { default: "var(--mantine-color-gray-1)", ":first-child": "transparent" },
  },
  head: { paddingBlock: "2px" },
  scope: { minWidth: 0, overflow: "hidden" },
  why: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});

function RecallTableHead() {
  return (
    <Box {...stylex.props(styles.row, styles.head)} aria-hidden>
      <Box />
      <Box />
      <Text size="xs" c="dimmed" fw={500}>
        Scope
      </Text>
      <Text size="xs" c="dimmed" fw={500}>
        Outcome
      </Text>
      <Text size="xs" c="dimmed" fw={500}>
        Why
      </Text>
    </Box>
  );
}

function RecallItemRowBody({ item, outcome }: { item: DerivationSummary; outcome?: RecallOutcome }) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  return (
    <Box {...stylex.props(styles.row)}>
      <KindGlyph catalog={catalog} kind={item.kind} label={item.kindLabel} size={10} />
      <AnchorLink to="/derivations/$id" params={{ id: item.id }} c="inherit" size="sm" underline="hover">
        {item.statement}
      </AnchorLink>
      <Box {...stylex.props(styles.scope)}>
        <ScopeChips scope={item.effectiveScope} labels={known.labels} wrap="wrap" />
      </Box>
      {outcome === undefined ? (
        <Box />
      ) : (
        <Badge color={outcome.color} tt="none" fw={500} w="fit-content">
          {outcome.label}
        </Badge>
      )}
      {outcome?.why === undefined ? (
        <Box />
      ) : (
        <Tooltip label={outcome.whyInFull ?? outcome.why} withArrow multiline maw={360} openDelay={300}>
          <SupportingText tier="secondary" {...stylex.props(styles.why)}>
            {outcome.why}
          </SupportingText>
        </Tooltip>
      )}
    </Box>
  );
}

/** A row, and `RecallItemRow.Head`, the column labels a table of rows starts with. */
export const RecallItemRow = Object.assign(RecallItemRowBody, { Head: RecallTableHead });
