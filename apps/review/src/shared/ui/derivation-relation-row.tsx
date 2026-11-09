/**
 * How one derivation stands to another, as a linked row in a list (Linear's sub-issues, a PR stack):
 * the relation in a label column, then the other one's statement, scope and status. Used for replacement
 * chains, re-proposals, contradictions and near repeats, so a relationship is never a sentence with a link.
 * Rows divide themselves; put them in a bordered `Paper`.
 */
import { Box, Group, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { PlaceKey } from "@tastebud/core/places";
import type { DerivationSummary } from "@tastebud/core/record-views";
import type { ReactNode } from "react";

import { KindGlyph } from "./kind-identity.tsx";
import { ScopeChips } from "./place-chips.tsx";
import { AnchorLink } from "./router-links.tsx";
import { DerivationStatusBadge } from "./status-chips.tsx";

const styles = stylex.create({
  row: {
    display: "grid",
    gridTemplateColumns: "136px minmax(0, 1fr)",
    columnGap: "12px",
    alignItems: "baseline",
    paddingBlock: "8px",
    paddingInline: "12px",
    borderTopWidth: { default: "1px", ":first-child": "0" },
    borderTopStyle: "solid",
    borderTopColor: "var(--mantine-color-gray-2)",
  },
  statement: { flex: 1, minWidth: 0 },
  quoted: { whiteSpace: "pre-wrap" },
});

export function DerivationRelationRow({
  relation,
  summary,
  catalog,
  labels,
  children,
}: {
  /** What the other one is to this one: "Newer version", "Says the opposite". */
  relation: string;
  summary: DerivationSummary;
  /** Picks the kind's glyph; passed in so shared/ui never reads a feature's query. */
  catalog: CatalogView | undefined;
  labels: ReadonlyMap<PlaceKey, string>;
  /** A sub-line under the statement, such as the agent's case for asking again. */
  children?: ReactNode;
}) {
  return (
    <Box {...stylex.props(styles.row)}>
      <Text size="xs" c="dimmed" fw={500}>
        {relation}
      </Text>
      <Stack gap="3xs">
        <Group gap="xs" wrap="nowrap" align="baseline">
          <KindGlyph catalog={catalog} kind={summary.kind} label={summary.kindLabel} size={10} />
          <Text size="sm" lineClamp={2} {...stylex.props(styles.statement)}>
            <AnchorLink to="/derivations/$id" params={{ id: summary.id }} size="sm" c="inherit" underline="hover">
              {summary.statement}
            </AnchorLink>
          </Text>
          <ScopeChips scope={summary.effectiveScope} labels={labels} />
          <DerivationStatusBadge status={summary.status} />
        </Group>
        {summary.reason !== undefined && (
          <Text size="xs" c="gray.7" {...stylex.props(styles.quoted)}>
            <Text span inherit c="dimmed">
              Reason{" "}
            </Text>
            “{summary.reason}”
          </Text>
        )}
        {children}
      </Stack>
    </Box>
  );
}
