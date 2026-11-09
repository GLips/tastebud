/**
 * What the inbox page tracks per card on the cards' behalf: scope drafts (so batch accept can tell edited
 * cards apart), which cards are mid-decision, and which were decided here and stay folded in place.
 */
import type { ScopeDraft } from "@tastebud/core/places";
import { useCallback, useState } from "react";

import type { InboxBatch } from "./use-inbox-card-triage.ts";

const withMember = (set: ReadonlySet<string>, id: string, member: boolean): ReadonlySet<string> => {
  if (set.has(id) === member) return set;
  const next = new Set(set);
  if (member) next.add(id);
  else next.delete(id);
  return next;
};

export function useInboxCardStates() {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, ScopeDraft>>(() => new Map());
  const [engagedIds, setEngagedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [decidedIds, setDecidedIds] = useState<ReadonlySet<string>>(() => new Set());
  // The newest decision made here, which `u` undoes: one card, or every card of a batch still decided.
  const [latest, setLatest] = useState<{ ids: ReadonlyArray<string>; batch: InboxBatch | undefined }>({
    ids: [],
    batch: undefined,
  });

  const setDraft = (id: string, draft: ScopeDraft | undefined) =>
    setDrafts((previous) => {
      const next = new Map(previous);
      if (draft === undefined) next.delete(id);
      else next.set(id, draft);
      return next;
    });
  // Stable, because each card reports through it from an effect.
  const setEngaged = useCallback(
    (id: string, engaged: boolean) => setEngagedIds((previous) => withMember(previous, id, engaged)),
    [],
  );
  // The scope draft is kept through a decision, so an Undo brings back the scope the owner had chosen.
  const markDecided = (id: string, decided: boolean, batch?: InboxBatch) => {
    setDecidedIds((previous) => withMember(previous, id, decided));
    setLatest((previous) => {
      if (!decided) return { ...previous, ids: previous.ids.filter((kept) => kept !== id) };
      return batch !== undefined && previous.batch === batch
        ? { ids: [...previous.ids, id], batch }
        : { ids: [id], batch };
    });
  };
  return { drafts, setDraft, engagedIds, setEngaged, decidedIds, latestDecidedIds: latest.ids, markDecided };
}
