/** The inbox's kinds, a tab per kind with how many wait in it. */
import { Box, SegmentedControl } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { CatalogView, DerivedKindView } from "@tastebud/core/kind-catalog";

import { CountBadge } from "#review/shared/ui/count-badge.tsx";
import { capitalize, KindGlyph } from "#review/shared/ui/kind-identity.tsx";

const styles = stylex.create({
  alignStart: { alignSelf: "flex-start" },
  tabLabel: { display: "inline-flex", alignItems: "center", gap: "6px" },
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
            <CountBadge count={pendingByKind.get(candidate.key) ?? 0} />
          </Box>
        ),
      }))}
      {...stylex.props(styles.alignStart)}
    />
  );
}
