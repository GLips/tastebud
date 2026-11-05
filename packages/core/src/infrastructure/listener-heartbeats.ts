/**
 * Listener cursors: one JSON file per `tastebud review listen --as <name>` under `.index/listeners/`,
 * holding what it has printed and its last heartbeat. `.index/` is disposable, so a missing or
 * unreadable cursor just starts over. Heartbeats run on wall time, never Effect's `Clock`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Effect, Schema } from "effect";

import { formatLocalIsoTime } from "#core/shared/iso-times.ts";

import { indexDirOf, writeFileAtomicSync } from "./record-files.ts";
import { StoreWriteFailed } from "./store-errors.ts";

const ListenerCursorSchema = Schema.Struct({
  name: Schema.String,
  /** Entries from before the listener first started are history, not news. */
  started_at: Schema.String,
  /** Human entries already printed. Bounded by human thread activity since `started_at`. */
  seen: Schema.Array(Schema.String),
  heartbeat_at: Schema.optionalKey(Schema.String),
});
export type ListenerCursor = typeof ListenerCursorSchema.Type;

const decodeListenerCursor = Schema.decodeUnknownSync(ListenerCursorSchema);

const listenersDirOf = (root: string) => join(indexDirOf(root), "listeners");

const cursorPathOf = (root: string, name: string) => join(listenersDirOf(root), `${name}.json`);

const readCursorFile = (path: string): ListenerCursor | undefined => {
  if (!existsSync(path)) return undefined;
  try {
    return decodeListenerCursor(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
};

/** Now, as the local ISO time cursors store. */
export const listenerWallClockIso = () => formatLocalIsoTime(new Date());

/** Now, in epoch milliseconds, for judging a heartbeat's age. */
export const listenerWallClockMs = () => Date.now();

export const readListenerCursor = (root: string, name: string) => readCursorFile(cursorPathOf(root, name));

/**
 * Read-modify-write with no yield in between: the listen loop's poll and heartbeat fibers share
 * one cursor file, and an interleaving would drop the other's change. A missing cursor starts now.
 */
export const updateListenerCursor = (
  root: string,
  name: string,
  update: (cursor: ListenerCursor) => ListenerCursor,
) => {
  const path = cursorPathOf(root, name);
  return Effect.try({
    try: () => {
      const now = listenerWallClockIso();
      writeFileAtomicSync(path, JSON.stringify(update(readCursorFile(path) ?? { name, started_at: now, seen: [] })));
    },
    catch: (error) => new StoreWriteFailed({ path, problem: String(error) }),
  });
};

/** Every readable cursor in the store, unordered. */
export const listListenerCursors = (root: string): Array<ListenerCursor> => {
  const directory = listenersDirOf(root);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      const cursor = readCursorFile(join(directory, file));
      return cursor === undefined ? [] : [cursor];
    });
};
