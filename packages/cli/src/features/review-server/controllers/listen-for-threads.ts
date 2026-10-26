/** `taste review listen`: polls for human thread notes and keeps this listener's heartbeat fresh. */
import { Effect, type Option } from "effect";

import { inCliStore, resolveCliStoreRoot } from "#cli/features/cli-operations/index.server.ts";
import {
  LISTEN_HEARTBEAT_MS,
  LISTEN_POLL_MS,
  pollListenerEvents,
  writeListenerHeartbeat,
} from "#cli/infrastructure/taste-core.ts";
import { printErrorLine, printLine } from "#cli/infrastructure/terminal.ts";

/** Never returns: one JSON line on stdout per new human note. */
export const listenForThreadNotes = Effect.fn("review-server.listenForThreadNotes")(function* (
  as: string,
  store: Option.Option<string>,
) {
  const poll = pollListenerEvents(as).pipe(
    Effect.flatMap((events) => Effect.forEach(events, (event) => printLine(JSON.stringify(event)))),
    Effect.andThen(Effect.sleep(LISTEN_POLL_MS)),
    Effect.forever,
  );
  const heartbeat = writeListenerHeartbeat(as).pipe(Effect.andThen(Effect.sleep(LISTEN_HEARTBEAT_MS)), Effect.forever);
  // stderr, so stdout stays one JSON object per line for Monitor.
  yield* printErrorLine(`taste: listening as ${as} on ${resolveCliStoreRoot(store)}`);
  yield* inCliStore(store, Effect.all([poll, heartbeat], { concurrency: "unbounded", discard: true }));
});
