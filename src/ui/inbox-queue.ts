/**
 * A review queue that holds still. The inbox polls every second, but the cards a reviewer is
 * working through never reorder under them: new proposals wait behind a "N new" button, and a card
 * decided elsewhere stays in place, marked gone, until the reviewer moves past it.
 */
import { useState } from "react";

import type { InboxCard, InboxGroup } from "../core/index.ts";

export interface InboxQueueEntry {
  readonly id: string;
  readonly card: InboxCard;
  readonly group: InboxGroup;
  /** No longer pending on the server, and not decided from this queue. */
  readonly gone: boolean;
}

export interface InboxQueue {
  readonly entries: ReadonlyArray<InboxQueueEntry>;
  readonly incomingCount: number;
  readonly showIncoming: () => void;
  /** Drops a card decided here, or a gone card the reviewer has acknowledged. */
  readonly remove: (id: string) => void;
}

const inboxGroupKeyOf = (group: InboxGroup): string => JSON.stringify([group.scopeKey, group.subject ?? null]);

interface QueueMemory {
  /** The poll result last absorbed; a new one is folded in during render. */
  readonly groups: ReadonlyArray<InboxGroup> | undefined;
  readonly kind: string;
  readonly orders: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Every card seen, so one decided elsewhere can still be shown as gone. */
  readonly latest: ReadonlyMap<string, { card: InboxCard; group: InboxGroup }>;
}

const liveEntriesOf = (groups: ReadonlyArray<InboxGroup> | undefined, kind: string) =>
  (groups ?? [])
    .filter((group) => group.kind === kind)
    .flatMap((group) => group.cards.map((card) => ({ id: card.derivation.id, card, group })));

// The first data seen for a kind seeds its order; later arrivals only ever append, on request.
const absorbInboxPoll = (
  memory: QueueMemory,
  groups: ReadonlyArray<InboxGroup> | undefined,
  kind: string,
): QueueMemory => {
  const live = liveEntriesOf(groups, kind);
  const latest = new Map(memory.latest);
  for (const entry of live) latest.set(entry.id, entry);
  const orders =
    memory.orders.has(kind) || groups === undefined
      ? memory.orders
      : new Map(memory.orders).set(
          kind,
          live.map((entry) => entry.id),
        );
  return { groups, kind, orders, latest };
};

export function useStableInboxQueue(groups: ReadonlyArray<InboxGroup> | undefined, kind: string): InboxQueue {
  const [stored, setStored] = useState<QueueMemory>(() =>
    absorbInboxPoll({ groups: undefined, kind, orders: new Map(), latest: new Map() }, groups, kind),
  );
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const stale = stored.groups !== groups || stored.kind !== kind;
  const memory = stale ? absorbInboxPoll(stored, groups, kind) : stored;
  if (stale) setStored(memory);

  const live = liveEntriesOf(groups, kind);
  const liveIds = new Set(live.map((entry) => entry.id));
  const order = memory.orders.get(kind) ?? [];
  const queued = new Set(order);
  const incoming = live.filter((entry) => !queued.has(entry.id) && !removed.has(entry.id));
  const entries = order.flatMap((id): Array<InboxQueueEntry> => {
    const known = memory.latest.get(id);
    return known === undefined || removed.has(id) ? [] : [{ id, ...known, gone: !liveIds.has(id) }];
  });

  return {
    entries,
    incomingCount: incoming.length,
    showIncoming: () =>
      setStored((previous) => ({
        ...previous,
        orders: new Map(previous.orders).set(kind, [...order, ...incoming.map((entry) => entry.id)]),
      })),
    remove: (id) => setRemoved((previous) => new Set(previous).add(id)),
  };
}

/** Entries bucketed by scope and subject, groups in the order their first card appears. */
export const groupQueueEntries = (
  entries: ReadonlyArray<InboxQueueEntry>,
): Array<{ key: string; group: InboxGroup; entries: Array<InboxQueueEntry> }> => {
  const buckets = new Map<string, { key: string; group: InboxGroup; entries: Array<InboxQueueEntry> }>();
  for (const entry of entries) {
    const key = inboxGroupKeyOf(entry.group);
    const bucket = buckets.get(key) ?? { key, group: entry.group, entries: [] };
    bucket.entries.push(entry);
    buckets.set(key, bucket);
  }
  return [...buckets.values()];
};
