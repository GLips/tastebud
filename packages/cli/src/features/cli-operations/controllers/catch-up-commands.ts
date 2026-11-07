/** `catch-up` and `catch-up-done`: what a catch-up has to read and weigh, and its receipts. */
import { Command } from "effect/cli";

import {
  actorFlag,
  definedFields,
  jsonFlag,
  optionalTextFlag,
  repeatableTextFlag,
  storeFlag,
} from "#cli/shared/cli-flags.ts";

import { describedAs, runCliOperation } from "./run-cli-operation.ts";

export const catchUpCommand = Command.make(
  "catch-up",
  {
    in: optionalTextFlag("in", "Where the catch-up runs (default: the current directory)"),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ json, store, ...flags }) => runCliOperation("catch-up", definedFields(flags), { store, json }),
).pipe(
  describedAs("catch-up"),
  Command.withExamples([{ command: "tastebud catch-up", description: "What is waiting since the last catch-up" }]),
);

export const catchUpDoneCommand = Command.make(
  "catch-up-done",
  {
    origin: optionalTextFlag("origin", "The source kind whose words you read in full"),
    readThrough: optionalTextFlag("read-through", "With --origin: everything said up to this ISO time was read"),
    considered: repeatableTextFlag("considered", "A source you finished weighing for proposals"),
    consideredFor: repeatableTextFlag(
      "considered-for",
      "With --considered: a kind's policy tag as catch-up printed it, e.g. belief@f415f659",
    ),
    note: optionalTextFlag("note", "What you proposed, or why nothing"),
    in: optionalTextFlag("in", "Where the catch-up ran (default: the current directory)"),
    by: actorFlag,
    json: jsonFlag,
    store: storeFlag,
  },
  ({ readThrough, consideredFor, by, json, store, ...flags }) =>
    runCliOperation(
      "catch-up-done",
      definedFields({ ...flags, read_through: readThrough, considered_for: consideredFor }),
      {
        store,
        json,
        actor: by,
      },
    ),
).pipe(
  describedAs("catch-up-done"),
  Command.withExamples([
    {
      command:
        "tastebud catch-up-done --origin memory --read-through 2026-11-06T09:12:00-08:00 --considered 0f3a9c1e --considered-for belief@f415f659 --by claude-code/2.x",
      description: "Sessions read through 9:12 and one source weighed",
    },
  ]),
);
