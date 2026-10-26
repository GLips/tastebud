/** `taste init`: a new store with a commented starter config. */
import { Effect, Option } from "effect";
import { Command } from "effect/cli";

import { initTasteStore } from "#cli/infrastructure/taste-core.ts";
import { currentUserName } from "#cli/infrastructure/terminal.ts";
import { jsonFlag, optionalTextFlag, storeFlag } from "#cli/shared/cli-flags.ts";

import { emitCliResult, resolveCliStoreRoot } from "./run-cli-operation.ts";

export const initCommand = Command.make(
  "init",
  {
    owner: optionalTextFlag("owner", "The human whose taste the store holds, human:<id> (default: human:$USER)"),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ owner, json, store }) =>
    Effect.gen(function* () {
      const root = resolveCliStoreRoot(store);
      const config = yield* initTasteStore(
        root,
        Option.getOrElse(owner, () => `human:${currentUserName()}`),
      );
      yield* emitCliResult(
        json,
        { root, owner: config.owner },
        () => `Created a store at ${root} owned by ${config.owner}. Edit ${root}/taste.config.ts to add kinds.`,
      );
    }),
).pipe(Command.withDescription("Create a store with a commented starter taste.config.ts"));
