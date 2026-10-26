/** `taste review listen`: human thread entries a named listener has not printed yet. */
import { Effect } from "effect";

import { derivationById } from "#core/domains/record-snapshot/index.ts";
import { isHumanAccount } from "#core/domains/taste-vocabulary/index.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { readListenerCursor, updateListenerCursor } from "#core/infrastructure/listener-heartbeats.ts";
import type { StoreWriteFailed } from "#core/infrastructure/store-errors.ts";
import type { CorruptRecordFile } from "#core/shared/corrupt-record-file.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";
import { compareIsoTimes } from "#core/shared/iso-times.ts";

import { threadReplyInstruction } from "./thread-entry.ts";

export const LISTEN_POLL_MS = 500;

/** One JSON line of `taste review listen` output. */
export interface ListenEvent {
  readonly derivation: string;
  readonly kind: string;
  readonly statement: string;
  readonly note: string;
  readonly at: string;
  readonly reply: string;
}

/** Listener names become file names under `.index/listeners/`, so only safe characters pass. */
export const validateListenerName = Effect.fn("review-threads.validateListenerName")(function* (name: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(name))
    return yield* new InvalidTasteInput({ problems: [`listener name "${name}" may only use letters, digits, . _ -`] });
  return name;
});

/**
 * One poll of `taste review listen --as <name>`: returns human thread entries not yet printed by
 * this listener and records them in its cursor, so a restarted listener never repeats one. The
 * first poll ever only creates the cursor.
 */
export const pollListenerEvents = Effect.fn("review-threads.pollListenerEvents")(function* (
  name: string,
): Effect.fn.Return<Array<ListenEvent>, InvalidTasteInput | CorruptRecordFile | StoreWriteFailed, TasteStore> {
  yield* validateListenerName(name);
  const store = yield* TasteStore;
  const cursor = readListenerCursor(store.root, name);
  if (cursor === undefined) {
    yield* updateListenerCursor(store.root, name, (created) => ({ ...created, heartbeat_at: created.started_at }));
    return [];
  }
  const snapshot = yield* store.snapshot;
  const seen = new Set(cursor.seen);
  const fresh = snapshot.threadEntries
    .filter((entry) => isHumanAccount(entry.author) && !seen.has(entry.id))
    .filter((entry) => compareIsoTimes(entry.at, cursor.started_at) >= 0)
    .sort((left, right) => compareIsoTimes(left.at, right.at) || left.id.localeCompare(right.id));
  if (fresh.length === 0) return [];
  yield* updateListenerCursor(store.root, name, (latest) => ({
    ...latest,
    seen: [...new Set([...latest.seen, ...fresh.map((entry) => entry.id)])],
  }));
  return fresh.map((entry) => {
    const derivation = derivationById(snapshot, entry.thread);
    return {
      derivation: entry.thread,
      kind: derivation?.kind ?? "",
      statement: derivation?.statement ?? "",
      note: entry.text,
      at: entry.at,
      reply: threadReplyInstruction(entry.thread, name),
    };
  });
});
