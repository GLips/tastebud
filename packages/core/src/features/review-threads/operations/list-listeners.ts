import { Effect, Schema } from "effect";

import { TasteStore } from "#core/features/record-store/index.server.ts";
import { listenerWallClockMs, listListenerCursors } from "#core/infrastructure/listener-heartbeats.ts";

/** The UI shows "agent listening" while a heartbeat is younger than this. */
const LISTENER_ALIVE_MS = 15_000;

export const ListenerHeartbeatSchema = Schema.Struct({
  name: Schema.String,
  /** Absent until its first heartbeat. */
  heartbeatAt: Schema.optionalKey(Schema.String),
  /** Its heartbeat is recent enough that the agent is taken to be listening now. */
  listening: Schema.Boolean,
});
export type ListenerHeartbeat = typeof ListenerHeartbeatSchema.Type;

/** Every listener that has ever run against this store, with whether it is alive now. */
export const listListenerHeartbeats: Effect.Effect<Array<ListenerHeartbeat>, never, TasteStore> = Effect.gen(
  function* () {
    const store = yield* TasteStore;
    const now = listenerWallClockMs();
    return listListenerCursors(store.root)
      .map((cursor): ListenerHeartbeat => {
        const heartbeatAt = cursor.heartbeat_at;
        const listening = heartbeatAt !== undefined && now - Date.parse(heartbeatAt) < LISTENER_ALIVE_MS;
        return heartbeatAt === undefined
          ? { name: cursor.name, listening }
          : { name: cursor.name, heartbeatAt, listening };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  },
);
