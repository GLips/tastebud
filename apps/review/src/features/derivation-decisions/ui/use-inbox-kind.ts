/**
 * Which kind's tab the inbox shows. A link's `kind` wins; a bare `/` opens the last tab used if anything
 * waits there, otherwise the busiest, chosen once per visit so deciding a tab's last item shows its
 * empty state rather than switching tabs under the reviewer. `chosenKind` is what the page writes back
 * into the URL, so the address always names the tab on screen.
 */
import type { InboxGroup } from "@tastebud/core/inbox";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { useEffect, useState } from "react";

import { readRememberedBrowserText, rememberBrowserText } from "#review/infrastructure/browser-storage.ts";

const LAST_KIND_KEY = "tastebud.inbox.kind";

const arrivalKindOf = (
  kinds: ReadonlyArray<DerivedKindView>,
  pendingByKind: ReadonlyMap<string, number>,
  remembered: string | undefined,
): string | undefined => {
  if (remembered !== undefined && (pendingByKind.get(remembered) ?? 0) > 0) return remembered;
  const busiest = kinds.toSorted((a, b) => (pendingByKind.get(b.key) ?? 0) - (pendingByKind.get(a.key) ?? 0))[0];
  return (pendingByKind.get(busiest?.key ?? "") ?? 0) > 0 ? busiest?.key : remembered;
};

const pendingByKindOf = (groups: ReadonlyArray<InboxGroup>): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const group of groups) counts.set(group.kind, (counts.get(group.kind) ?? 0) + group.cards.length);
  return counts;
};

export function useInboxKind(
  kinds: ReadonlyArray<DerivedKindView>,
  groups: ReadonlyArray<InboxGroup> | undefined,
  linkedKind: string | undefined,
) {
  const pendingByKind = pendingByKindOf(groups ?? []);
  const [arrivalKind, setArrivalKind] = useState<string | undefined>(undefined);
  if (arrivalKind === undefined && groups !== undefined && kinds.length > 0)
    setArrivalKind(arrivalKindOf(kinds, pendingByKind, readRememberedBrowserText(LAST_KIND_KEY)) ?? kinds[0]?.key);
  const requested = linkedKind ?? arrivalKind;
  const kind = kinds.find((candidate) => candidate.key === requested) ?? kinds[0];
  // Only a tab actually chosen is remembered, not the placeholder shown before the arrival tab is.
  const chosenKind = requested === undefined ? undefined : kind?.key;
  useEffect(() => {
    if (chosenKind !== undefined) rememberBrowserText(LAST_KIND_KEY, chosenKind);
  }, [chosenKind]);
  return { kind, chosenKind, pendingByKind };
}
