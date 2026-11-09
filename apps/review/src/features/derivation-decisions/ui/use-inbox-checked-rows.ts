/**
 * The rows checked for a bulk decision, apart from the one open in the pane. `x` checks the open row,
 * a checkbox click checks one, and a shift-click checks the run from the last row checked. Esc clears.
 */
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useState } from "react";

/** The ids from `anchor` to `id` inclusive, in shown order; just `id` when the anchor has left the order. */
const inboxRowRange = (order: ReadonlyArray<string>, anchor: string | undefined, id: string) => {
  const from = anchor === undefined ? -1 : order.indexOf(anchor);
  const to = order.indexOf(id);
  if (from < 0 || to < 0) return [id];
  return order.slice(Math.min(from, to), Math.max(from, to) + 1);
};

export function useInboxCheckedRows({
  order,
  focusedId,
  holdsKeyboard,
}: {
  /** The ids that can be checked, in the order shown: pending rows still in the queue. */
  order: ReadonlyArray<string>;
  /** The row open in the pane, which `x` checks. */
  focusedId: string | undefined;
  /** A card mid-decision keeps the keyboard, so x and Esc are its own. */
  holdsKeyboard: boolean;
}) {
  const [stored, setStored] = useState<ReadonlySet<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  // A row decided or gone leaves the order, and so leaves the selection without being cleared from it.
  const checkedIds = order.filter((id) => stored.has(id));

  const toggle = (id: string) => {
    setStored((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  };
  // A range takes the anchor's state, as in a mail list: from a checked row it checks the run, from an unchecked one it clears it.
  const extendTo = (id: string) => {
    const range = inboxRowRange(order, anchor, id);
    const checking = anchor === undefined || stored.has(anchor);
    setStored((previous) => {
      const next = new Set(previous);
      for (const each of range) {
        if (checking) next.add(each);
        else next.delete(each);
      }
      return next;
    });
    setAnchor(id);
  };
  const clear = () => {
    setStored(new Set());
    setAnchor(undefined);
  };
  const uncheck = (ids: ReadonlyArray<string>) =>
    setStored((previous) => new Set([...previous].filter((id) => !ids.includes(id))));

  useHotkeys([
    {
      hotkey: "X",
      callback: () => focusedId !== undefined && toggle(focusedId),
      options: { enabled: !holdsKeyboard && focusedId !== undefined },
    },
    {
      hotkey: "Escape",
      callback: clear,
      options: { enabled: !holdsKeyboard && checkedIds.length > 0, ignoreInputs: true },
    },
  ]);

  return { checkedIds, isChecked: (id: string) => stored.has(id), toggle, extendTo, clear, uncheck };
}
