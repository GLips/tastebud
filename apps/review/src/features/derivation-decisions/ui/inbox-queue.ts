/**
 * A review queue that holds still. The inbox polls every second, but the cards a reviewer is
 * working through never reorder under them: new proposals wait behind a "N new" button, and a card
 * decided elsewhere stays in place, marked gone, until the reviewer moves past it.
 */
import type { InboxCard, InboxGroup } from "@tastebud/core/inbox";
import type { DerivationScope } from "@tastebud/core/places";
import { useEffect, useState } from "react";

import { placeFormOf } from "#review/shared/ui/place-chips.tsx";

export interface InboxQueueEntry {
  readonly id: string;
  readonly card: InboxCard;
  readonly group: InboxGroup;
  /** No longer pending on the server, and not decided from this queue. */
  readonly gone: boolean;
}

export interface InboxQueueBucket {
  readonly key: string;
  readonly group: InboxGroup;
  readonly entries: ReadonlyArray<InboxQueueEntry>;
}

export interface InboxQueue {
  /** The queue as rendered: bucketed by scope and subject, buckets in a fixed order of scope. */
  readonly buckets: ReadonlyArray<InboxQueueBucket>;
  /** Every entry in rendered order, so j/k and "the next card" follow what the reviewer sees. */
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
  /** Restored after the inbox was away: the next poll drops what was decided meanwhile instead of showing it gone. */
  readonly returning: boolean;
}

/**
 * The queue as the reviewer left it, outside React so a trip to a card's page and back (to leave a
 * note, say) finds the same order. Re-seeding instead would re-sort groups by their oldest card,
 * and a group whose first card was decided would jump.
 */
let leftInboxQueue: QueueMemory | undefined;

const liveEntriesOf = (groups: ReadonlyArray<InboxGroup> | undefined, kind: string) =>
  (groups ?? [])
    .filter((group) => group.kind === kind)
    .flatMap((group) => group.cards.map((card) => ({ id: card.derivation.id, card, group })));

const keepOnlyLive = (
  orders: ReadonlyMap<string, ReadonlyArray<string>>,
  groups: ReadonlyArray<InboxGroup>,
): ReadonlyMap<string, ReadonlyArray<string>> =>
  new Map(
    [...orders].map(([kind, ids]) => {
      const live = new Set(liveEntriesOf(groups, kind).map((entry) => entry.id));
      return [kind, ids.filter((id) => live.has(id))];
    }),
  );

// The first data seen for a kind seeds its order; later arrivals only ever append, on request.
const absorbInboxPoll = (
  memory: QueueMemory,
  groups: ReadonlyArray<InboxGroup> | undefined,
  kind: string,
): QueueMemory => {
  if (groups === undefined) return { ...memory, groups, kind };
  const live = liveEntriesOf(groups, kind);
  const latest = new Map(memory.latest);
  for (const entry of live) latest.set(entry.id, entry);
  const kept = memory.returning ? keepOnlyLive(memory.orders, groups) : memory.orders;
  const orders = kept.has(kind)
    ? kept
    : new Map(kept).set(
        kind,
        live.map((entry) => entry.id),
      );
  return { groups, kind, orders, latest, returning: false };
};

/** Where a group's scope sorts: one repo or folder, one named place, everywhere, then several places. */
const scopeSectionRankOf = (scope: DerivationScope): number => {
  if (scope.scope === "global") return 2;
  const [only, ...rest] = scope.places;
  if (only === undefined || rest.length > 0) return 3;
  return placeFormOf(only) === "named" ? 1 : 0;
};

// Groups sort by a fixed rule, not by arrival, so the sections read the same on every reload. Within a
// group the cards keep their stable order. An arrival appended to the order can still belong to an
// earlier bucket, which is why the rendered order is the bucketed one and not the raw order.
const bucketQueueEntries = (entries: ReadonlyArray<InboxQueueEntry>): Array<InboxQueueBucket> => {
  const buckets = new Map<string, { key: string; group: InboxGroup; entries: Array<InboxQueueEntry> }>();
  for (const entry of entries) {
    const key = inboxGroupKeyOf(entry.group);
    const bucket = buckets.get(key) ?? { key, group: entry.group, entries: [] };
    bucket.entries.push(entry);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].toSorted(
    (a, b) => scopeSectionRankOf(a.group.scope) - scopeSectionRankOf(b.group.scope) || a.key.localeCompare(b.key),
  );
};

export function useStableInboxQueue(groups: ReadonlyArray<InboxGroup> | undefined, kind: string): InboxQueue {
  const [stored, setStored] = useState<QueueMemory>(() =>
    absorbInboxPoll(
      leftInboxQueue === undefined
        ? { groups: undefined, kind, orders: new Map(), latest: new Map(), returning: false }
        : { ...leftInboxQueue, returning: true },
      groups,
      kind,
    ),
  );
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const stale = stored.groups !== groups || stored.kind !== kind;
  const memory = stale ? absorbInboxPoll(stored, groups, kind) : stored;
  if (stale) setStored(memory);
  // Decided cards need no carrying over: they are no longer live, so the return trip drops them.
  useEffect(() => {
    leftInboxQueue = stored;
  }, [stored]);

  const live = liveEntriesOf(groups, kind);
  const liveIds = new Set(live.map((entry) => entry.id));
  const order = memory.orders.get(kind) ?? [];
  const ordered = new Set(order);
  const incoming = live.filter((entry) => !ordered.has(entry.id) && !removed.has(entry.id));
  const buckets = bucketQueueEntries(
    order.flatMap((id): Array<InboxQueueEntry> => {
      const known = memory.latest.get(id);
      return known === undefined || removed.has(id) ? [] : [{ id, ...known, gone: !liveIds.has(id) }];
    }),
  );

  return {
    buckets,
    entries: buckets.flatMap((bucket) => bucket.entries),
    incomingCount: incoming.length,
    showIncoming: () =>
      setStored((previous) => ({
        ...previous,
        orders: new Map(previous.orders).set(kind, [...order, ...incoming.map((entry) => entry.id)]),
      })),
    remove: (id) => setRemoved((previous) => new Set(previous).add(id)),
  };
}
