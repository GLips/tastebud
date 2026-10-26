/** `taste reindex`. */
import { Command } from "effect/cli";

import { jsonFlag, storeFlag } from "#cli/shared/cli-flags.ts";

import { describedAs, runCliOperation } from "./run-cli-operation.ts";

export const reindexCommand = Command.make("reindex", { json: jsonFlag, store: storeFlag }, ({ json, store }) =>
  runCliOperation("reindex", {}, { store, json }),
).pipe(describedAs("reindex"));
