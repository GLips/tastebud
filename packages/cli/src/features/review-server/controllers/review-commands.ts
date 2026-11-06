/** `tastebud review` (serves the review UI) and `tastebud review listen` (wakes an agent on human notes). */
import { Command, Flag } from "effect/cli";

import { jsonFlag, storeFlag } from "#cli/shared/cli-flags.ts";

import { listenForThreadNotes } from "./listen-for-threads.ts";
import { startReviewServer } from "./start-review-server.ts";

const listenCommand = Command.make(
  "listen",
  {
    as: Flag.String("as").pipe(Flag.withDescription("This agent's name; also names its cursor file")),
    // Accepted for uniformity: listen output is always one JSON object per line.
    json: jsonFlag,
    store: storeFlag,
  },
  ({ as, store }) => listenForThreadNotes(as, store),
).pipe(Command.withDescription("Never exits: prints one JSON line per new human thread note"));

export const reviewCommand = Command.make(
  "review",
  {
    port: Flag.optional(Flag.Int("port")).pipe(Flag.withDescription("Overrides the store config's review.port")),
    open: Flag.Boolean("open").pipe(
      Flag.withDescription("Open it in the browser; exits at once if this store's review UI is already up"),
      Flag.withDefault(false),
    ),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ port, open, json, store }) => startReviewServer(port, open, json, store),
).pipe(Command.withDescription("Start the review UI on 127.0.0.1"), Command.withSubcommands([listenCommand]));
