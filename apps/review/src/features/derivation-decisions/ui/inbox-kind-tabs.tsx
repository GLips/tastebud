/** The inbox's kinds, a tab per kind with how many wait in it. */
import type { CatalogView, DerivedKindView } from "@tastebud/core/kind-catalog";

import { CountedTabs } from "#review/shared/ui/counted-tabs.tsx";
import { capitalize, KindGlyph } from "#review/shared/ui/kind-identity.tsx";

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
    <CountedTabs
      label="Kind"
      value={kind.key}
      onChange={onShowKind}
      options={kinds.map((candidate) => ({
        value: candidate.key,
        label: capitalize(candidate.plural),
        icon: <KindGlyph catalog={catalog} kind={candidate.key} />,
        count: pendingByKind.get(candidate.key) ?? 0,
      }))}
    />
  );
}
