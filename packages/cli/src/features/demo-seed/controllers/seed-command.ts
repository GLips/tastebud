/** `taste seed`: writes the fictional demo store into an empty store root. */
import { Effect } from "effect";
import { Command } from "effect/cli";

import { emitCliResult, resolveCliStoreRoot } from "#cli/features/cli-operations/index.server.ts";
import { jsonFlag, storeFlag } from "#cli/shared/cli-flags.ts";

import { seedTasteDemoStore } from "./seed-demo-store.ts";

export const seedCommand = Command.make("seed", { json: jsonFlag, store: storeFlag }, ({ json, store }) =>
  Effect.gen(function* () {
    const seeded = yield* seedTasteDemoStore(resolveCliStoreRoot(store));
    yield* emitCliResult(
      json,
      seeded,
      ({ root, recordCount, owner }) => `Seeded a demo store at ${root} (${recordCount} records, owner ${owner}).`,
    );
  }),
).pipe(Command.withDescription("Write the fictional Acme demo store (refuses a non-empty store)"));
