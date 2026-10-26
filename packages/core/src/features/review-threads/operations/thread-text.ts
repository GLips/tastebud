/** The text thread writes and `listeners` print. */
import { section } from "#core/domains/record-text/index.ts";
import type { ThreadEntryRecord } from "#core/domains/records/index.ts";

import type { ListenerHeartbeat } from "./list-listeners.ts";

export const renderThreadEntryText = (result: { readonly entry: ThreadEntryRecord }) =>
  `Added ${result.entry.author}'s entry ${result.entry.id} to ${result.entry.thread}'s thread.`;

export const renderListenersText = (result: { readonly listeners: ReadonlyArray<ListenerHeartbeat> }) =>
  section(
    "Listeners",
    result.listeners.map(
      (listener) =>
        `- ${listener.name}: ${listener.listening ? "listening" : "not listening"} (last heartbeat ${listener.heartbeatAt ?? "never"})`,
    ),
  );
