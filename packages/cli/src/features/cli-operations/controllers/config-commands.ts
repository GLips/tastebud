/**
 * The store's config: `config-show`, `config-check` and `config-write`, plus `init` (the starter
 * text through the same write).
 */
import { starterTastebudConfigText } from "@tastebud/core/store-config";
import { Effect, Option } from "effect";
import { Command, Flag } from "effect/cli";

import { currentUserName } from "#cli/infrastructure/terminal.ts";
import { definedFields, jsonFlag, optionalTextFlag, repeatableTextFlag, storeFlag } from "#cli/shared/cli-flags.ts";

import { describedAs, readTextOrStdin, runCliOperation } from "./run-cli-operation.ts";

const configTextFlag = Flag.String("text").pipe(
  Flag.withDescription("The complete tastebud.config.ts text, or - to read it from stdin"),
);

export const configShowCommand = Command.make(
  "config-show",
  {
    guide: Flag.Boolean("guide").pipe(
      Flag.withDescription("Also print the setup interview to lead the owner through"),
      Flag.withDefault(false),
    ),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ guide, json, store }) => runCliOperation("config-show", { guide }, { store, json }),
).pipe(describedAs("config-show"));

export const configCheckCommand = Command.make(
  "config-check",
  {
    text: configTextFlag,
    probe: repeatableTextFlag("probe", "A directory to resolve under the candidate's place setting"),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ text, probe, json, store }) =>
    Effect.gen(function* () {
      const input = definedFields({ text: yield* readTextOrStdin(text), probes: probe });
      yield* runCliOperation("config-check", input, { store, json });
    }),
).pipe(
  describedAs("config-check"),
  Command.withExamples([
    { command: "tastebud config-check --text - --probe ~/code/web < draft.config.ts", description: "Check a draft" },
  ]),
);

export const configWriteCommand = Command.make(
  "config-write",
  {
    text: configTextFlag,
    expectedCurrent: Flag.String("expected-current").pipe(
      Flag.withDescription('The hash config-show printed, or "" to create a new store'),
    ),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ text, expectedCurrent, json, store }) =>
    Effect.gen(function* () {
      const input = { text: yield* readTextOrStdin(text), expected_current: expectedCurrent };
      yield* runCliOperation("config-write", input, { store, json });
    }),
).pipe(describedAs("config-write"));

/** `config-write` of the commented starter, for a person creating a store without an agent. */
export const initCommand = Command.make(
  "init",
  {
    owner: optionalTextFlag("owner", "The human whose taste the store holds, human:<id> (default: human:$USER)"),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ owner, json, store }) => {
    const text = starterTastebudConfigText(Option.getOrElse(owner, () => `human:${currentUserName()}`));
    return runCliOperation("config-write", { text, expected_current: "" }, { store, json });
  },
).pipe(
  Command.withDescription("Create a store with the commented starter tastebud.config.ts (an agent's setup does more)"),
);
