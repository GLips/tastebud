/** The inbox's kinds, a tab per kind with how many wait in it. */
import { Box, SegmentedControl } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { CatalogView, DerivedKindView } from "@tastebud/core/kind-catalog";

import { capitalize, KindGlyph } from "#review/shared/ui/kind-identity.tsx";

const styles = stylex.create({
  alignStart: { alignSelf: "flex-start" },
  tabLabel: { display: "inline-flex", alignItems: "center", gap: "6px" },
  tabCount: { fontVariantNumeric: "tabular-nums", color: "var(--mantine-color-gray-6)", fontWeight: 500 },
});

export type InboxKindsProps = {
  catalog: CatalogView | undefined;
  kinds: ReadonlyArray<DerivedKindView>;
  kind: DerivedKindView;
  pendingByKind: ReadonlyMap<string, number>;
  onShowKind: (key: string) => void;
};

export function InboxKindTabs({ catalog, kinds, kind, pendingByKind, onShowKind }: InboxKindsProps) {
  if (kinds.length < 2) return null;
  return (
    <SegmentedControl
      size="sm"
      value={kind.key}
      onChange={onShowKind}
      data={kinds.map((candidate) => ({
        value: candidate.key,
        label: (
          <Box component="span" {...stylex.props(styles.tabLabel)}>
            <KindGlyph catalog={catalog} kind={candidate.key} />
            {capitalize(candidate.plural)}
            <Box component="span" {...stylex.props(styles.tabCount)}>
              {pendingByKind.get(candidate.key) ?? 0}
            </Box>
          </Box>
        ),
      }))}
      {...stylex.props(styles.alignStart)}
    />
  );
}
