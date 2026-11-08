/** One item in the recall inspector: its statement, then in words why it landed where it did, and its scope. */
import { Box, Group, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationSummary } from "@tastebud/core/record-views";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

const styles = stylex.create({
  row: {
    display: "grid",
    gridTemplateColumns: "12px minmax(0, 1fr)",
    columnGap: "8px",
    alignItems: "baseline",
    paddingBlock: "6px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: { default: "var(--mantine-color-gray-1)", ":first-child": "transparent" },
  },
  rowBody: { minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" },
});

export function RecallItemRow({
  item,
  reason,
  reasonColor = "dimmed",
}: {
  item: DerivationSummary;
  reason?: string;
  reasonColor?: string;
}) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  return (
    <Box {...stylex.props(styles.row)}>
      <KindGlyph catalog={catalog} kind={item.kind} label={item.kindLabel} size={10} />
      <Box {...stylex.props(styles.rowBody)}>
        <AnchorLink to="/derivations/$id" params={{ id: item.id }} c="inherit" fw={500} size="sm" underline="hover">
          {item.statement}
        </AnchorLink>
        <Group gap="xs">
          {reason !== undefined && (
            <Text size="xs" c={reasonColor}>
              {reason}
            </Text>
          )}
          <ScopeChips scope={item.effectiveScope} labels={known.labels} />
        </Group>
      </Box>
    </Box>
  );
}
