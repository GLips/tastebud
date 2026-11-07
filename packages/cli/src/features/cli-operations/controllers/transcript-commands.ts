/** `transcript-candidates`: the owner's typed words from recent Claude Code sessions, for a mining pass. */
import { Command, Flag } from "effect/cli";

import { definedFields, jsonFlag, optionalTextFlag, repeatableTextFlag, storeFlag } from "#cli/shared/cli-flags.ts";

import { describedAs, runCliOperation } from "./run-cli-operation.ts";

export const transcriptCandidatesCommand = Command.make(
  "transcript-candidates",
  {
    days: Flag.optional(Flag.Int("days")).pipe(Flag.withDescription("How many days back to read (default 7)")),
    project: repeatableTextFlag("project", "Only messages sent in this place or under it, e.g. github.com/acme/web::"),
    after: optionalTextFlag("after", "Only messages sent after this ISO time, e.g. a catch-up's last reading"),
    before: optionalTextFlag("before", "Only messages sent at or before this ISO time"),
    similarTo: optionalTextFlag(
      "similar-to",
      "Only messages that repeat this request, most alike first (30 days back)",
    ),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ json, store, similarTo, ...flags }) =>
    runCliOperation("transcript-candidates", definedFields({ ...flags, similar_to: similarTo }), { store, json }),
).pipe(
  describedAs("transcript-candidates"),
  Command.withExamples([
    {
      command: "tastebud transcript-candidates --days 3 --project github.com/acme/web:: --json",
      description: "What the owner typed in one project these three days",
    },
    {
      command: 'tastebud transcript-candidates --similar-to "where did we land" --json',
      description: "Where the owner asked the same thing in other sessions",
    },
  ]),
);
