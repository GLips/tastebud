/** `transcript-candidates`: the owner's typed words from recent Claude Code sessions, for a mining pass. */
import { Command, Flag } from "effect/cli";

import { definedFields, jsonFlag, repeatableTextFlag, storeFlag } from "#cli/shared/cli-flags.ts";

import { describedAs, runCliOperation } from "./run-cli-operation.ts";

export const transcriptCandidatesCommand = Command.make(
  "transcript-candidates",
  {
    days: Flag.optional(Flag.Int("days")).pipe(Flag.withDescription("How many days back to read (default 7)")),
    project: repeatableTextFlag("project", "Only messages sent in this place or under it, e.g. github.com/acme/web::"),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ json, store, ...flags }) => runCliOperation("transcript-candidates", definedFields(flags), { store, json }),
).pipe(
  describedAs("transcript-candidates"),
  Command.withExamples([
    {
      command: "tastebud transcript-candidates --days 3 --project github.com/acme/web:: --json",
      description: "What the owner typed in one project these three days",
    },
  ]),
);
