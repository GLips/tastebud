/**
 * How one derivation stands to another, as a linked row in a list (Linear's sub-issues, a PR stack):
 * the relation in a fixed label column, then the other one's statement, scope and status. A version
 * stack sets `place`: the derivation being read is the bold `current` line, and later versions hang
 * under it as `child` rows on a rail. Rows divide themselves; put them in a bordered `Paper`.
 */
import { Box, Group, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { PlaceKey } from "@tastebud/core/places";
import type { DerivationSummary } from "@tastebud/core/record-views";
import { CornerDownRight } from "lucide-react";
import type { ReactNode } from "react";

import { KindGlyph } from "./kind-identity.tsx";
import { ScopeChips } from "./place-chips.tsx";
import { AnchorLink } from "./router-links.tsx";
import { DerivationStatusBadge } from "./status-chips.tsx";

const styles = stylex.create({
  row: {
    display: "grid",
    gridTemplateColumns: "128px minmax(0, 1fr)",
    columnGap: "12px",
    alignItems: "baseline",
    paddingBlock: "8px",
    paddingInline: "12px",
    borderTopWidth: { default: "1px", ":first-child": "0" },
    borderTopStyle: "solid",
    borderTopColor: "var(--mantine-color-gray-2)",
  },
  current: { backgroundColor: "var(--mantine-color-gray-0)" },
  // The rail: a child's body sits right of a line dropping from the line above it.
  child: {
    borderLeftWidth: "1px",
    borderLeftStyle: "solid",
    borderLeftColor: "var(--mantine-color-gray-3)",
    marginLeft: "4px",
    paddingLeft: "10px",
  },
  statement: { flex: 1, minWidth: 0 },
  quoted: { whiteSpace: "pre-wrap" },
  elbow: { flexShrink: 0, alignSelf: "center" },
});

/** Where a row sits in a version stack; `flat` for any other relation. */
export type DerivationRelationPlace = "flat" | "current" | "child";

export function DerivationRelationRow({
  relation,
  summary,
  catalog,
  labels,
  place = "flat",
  children,
}: {
  /** What the other one is to this one: "Newer version", "Says the opposite". */
  relation: string;
  summary: DerivationSummary;
  /** Picks the kind's glyph; passed in so shared/ui never reads a feature's query. */
  catalog: CatalogView | undefined;
  labels: ReadonlyMap<PlaceKey, string>;
  place?: DerivationRelationPlace | undefined;
  /** A sub-line under the statement, such as the agent's case for asking again. */
  children?: ReactNode;
}) {
  const current = place === "current";
  return (
    <Box {...stylex.props(styles.row, current && styles.current)}>
      <Text size="xs" c="dimmed" fw={500}>
        {relation}
      </Text>
      <Stack gap="3xs" {...stylex.props(place === "child" && styles.child)}>
        <Group gap="xs" wrap="nowrap" align="baseline">
          {place === "child" && (
            <CornerDownRight
              size={12}
              color="var(--mantine-color-gray-5)"
              aria-hidden
              {...stylex.props(styles.elbow)}
            />
          )}
          <KindGlyph catalog={catalog} kind={summary.kind} label={summary.kindLabel} size={10} />
          <Text size="sm" fw={current ? 600 : 400} lineClamp={2} {...stylex.props(styles.statement)}>
            {current ? (
              summary.statement
            ) : (
              <AnchorLink to="/derivations/$id" params={{ id: summary.id }} size="sm" c="inherit" underline="hover">
                {summary.statement}
              </AnchorLink>
            )}
          </Text>
          <ScopeChips scope={summary.effectiveScope} labels={labels} />
          <DerivationStatusBadge status={summary.status} />
        </Group>
        {summary.reason !== undefined && !current && (
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
