/**
 * Which proposal is open in the inbox's pane, and j/k to move it. The first row is selected on arrival;
 * a decided row leaves the order, and selection falls to whatever now sits at the same position. The
 * selected row scrolls itself into view (see InboxCardSlot), so j/k and an advance both keep it seen.
 */
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useEffect, useState } from "react";

/** The card selected when the inbox last unmounted, so a trip to a card's page and back keeps the reviewer's place. */
let leftSelectedCard: string | undefined;

export function useInboxSelection({
  order,
  linkedCard,
  holdsKeyboard,
}: {
  /** The ids j/k step through, in the order shown. */
  order: ReadonlyArray<string>;
  /** The card a link named (`?card=`), selected whenever the link changes. */
  linkedCard: string | undefined;
  /** Whether a card is mid-decision, which keeps j/k from moving away from it. */
  holdsKeyboard: (id: string) => boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(linkedCard ?? leftSelectedCard);
  const [seenLink, setSeenLink] = useState(linkedCard);
  if (linkedCard !== seenLink) {
    setSeenLink(linkedCard);
    setSelectedId(linkedCard);
  }
  const [lastIndex, setLastIndex] = useState(0);
  const selectedIndex = selectedId === undefined ? -1 : order.indexOf(selectedId);
  if (selectedIndex >= 0 && selectedIndex !== lastIndex) setLastIndex(selectedIndex);
  const effectiveId = selectedIndex >= 0 ? selectedId : order[Math.min(lastIndex, order.length - 1)];
  useEffect(() => {
    leftSelectedCard = effectiveId;
  }, [effectiveId]);

  const engaged = effectiveId !== undefined && holdsKeyboard(effectiveId);
  const move = (by: 1 | -1) => () => {
    if (order.length === 0) return;
    const at = effectiveId === undefined ? -1 : order.indexOf(effectiveId);
    setSelectedId(order[Math.max(0, Math.min(order.length - 1, at + by))]);
  };
  useHotkeys([
    { hotkey: "J", callback: move(1), options: { enabled: !engaged } },
    { hotkey: "K", callback: move(-1), options: { enabled: !engaged } },
  ]);
  return { effectiveId, select: setSelectedId, linkedCard: seenLink };
}
