/**
 * Deciding the checked rows together. Each one is decided through its own card, so every row folds to
 * its outcome with its own Undo just as a single decision does, and the batch is undone together. A
 * batch locks the cards it queued until each one is written, so nothing it counted as unchanged can be
 * edited under it.
 */
import { isSameScope, type ScopeDraft } from "@tastebud/core/places";
import { useState } from "react";

import type { InboxQueueEntry } from "./inbox-queue.ts";
import type { InboxBatch, InboxCardHandle } from "./use-inbox-card-triage.ts";

/** Believable as proposed in a batch: not edited, nothing to acknowledge, and not mid-decision. */
export const isBelievableAsProposed = (
  entry: InboxQueueEntry,
  drafts: ReadonlyMap<string, ScopeDraft>,
  engagedIds: ReadonlySet<string>,
) => {
  const draft = drafts.get(entry.id);
  const edited = draft !== undefined && !isSameScope(entry.card.derivation.proposedScope, draft);
  return !entry.gone && !edited && !engagedIds.has(entry.id) && entry.card.needsAcknowledgement.length === 0;
};

type InboxBatchFailure = { readonly id: string; readonly sentence: string };

/** Resolves to the refusal sentence, or undefined once the decision landed. */
type DecideThroughCard = (handle: InboxCardHandle, batch: InboxBatch) => Promise<string | undefined>;

export function useInboxBatch(cardHandles: ReadonlyMap<string, InboxCardHandle>) {
  const [queued, setQueued] = useState<ReadonlySet<string>>(() => new Set());
  const [failures, setFailures] = useState<ReadonlyArray<InboxBatchFailure>>([]);

  const run = async (ids: InboxBatch, decide: DecideThroughCard) => {
    setQueued((previous) => new Set([...previous, ...ids]));
    setFailures([]);
    const failed: Array<InboxBatchFailure> = [];
    // One at a time, in the order shown: a later card may be refused because an earlier one landed.
    const decideInOrder = async ([id, ...rest]: ReadonlyArray<string>): Promise<void> => {
      if (id === undefined) return;
      // Unqueued as its turn comes, so the card shows its own decision pending rather than "Queued".
      setQueued((previous) => new Set([...previous].filter((kept) => kept !== id)));
      const handle = cardHandles.get(id);
      const refusal =
        handle === undefined
          ? "Left undecided: the inbox moved to another kind before its turn."
          : await decide(handle, ids);
      if (refusal !== undefined) failed.push({ id, sentence: refusal });
      await decideInOrder(rest);
    };
    await decideInOrder(ids);
    setFailures(failed);
  };

  return {
    queued,
    pending: queued.size > 0,
    failures,
    believeAsProposed: (ids: InboxBatch) => run(ids, (handle, batch) => handle.acceptAsProposed(batch)),
    rejectWithReason: (ids: InboxBatch, reason: string) =>
      run(ids, (handle, batch) => handle.rejectWithReason(reason, batch)),
  };
}
