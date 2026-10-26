import { Effect } from "effect";

import { TasteStore } from "#core/features/record-store/index.server.ts";
import { listenerWallClockIso, updateListenerCursor } from "#core/infrastructure/listener-heartbeats.ts";
import type { StoreWriteFailed } from "#core/infrastructure/store-errors.ts";
import type { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

import { validateListenerName } from "./poll-threads.ts";

export const LISTEN_HEARTBEAT_MS = 5_000;

/** Called every 5s by the listen loop. Creates the cursor if the listener has not polled yet. */
export const writeListenerHeartbeat = Effect.fn("review-threads.writeListenerHeartbeat")(function* (
  name: string,
): Effect.fn.Return<void, InvalidTasteInput | StoreWriteFailed, TasteStore> {
  yield* validateListenerName(name);
  const store = yield* TasteStore;
  yield* updateListenerCursor(store.root, name, (cursor) => ({ ...cursor, heartbeat_at: listenerWallClockIso() }));
});
