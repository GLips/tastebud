import { Effect, Option } from "effect";

import { resolveCliStoreRoot } from "#cli/features/cli-operations/index.server.ts";
import { adoptChildExitCode, spawnReviewAppProcess } from "#cli/infrastructure/review-app-process.ts";
import { provideTasteStore, TasteStore } from "#cli/infrastructure/taste-core.ts";
import { printLine } from "#cli/infrastructure/terminal.ts";

/** Starts the review UI's dev server against the store and waits for it to exit. */
export const startReviewServer = Effect.fn("review-server.startReviewServer")(function* (
  portOverride: Option.Option<number>,
  json: boolean,
  store: Option.Option<string>,
) {
  const root = resolveCliStoreRoot(store);
  // Fails with StoreNotInitialised before a server starts against nothing.
  const configuredPort = yield* provideTasteStore(root)(
    TasteStore.use((tasteStore) => Effect.succeed(tasteStore.config.review.port)),
  );
  const port = Option.getOrElse(portOverride, () => configuredPort);
  const child = yield* spawnReviewAppProcess(port, root);
  const url = `http://localhost:${port}/`;
  yield* printLine(json ? JSON.stringify({ url, store: root }) : `Taste review: ${url}  (store ${root})`);
  yield* adoptChildExitCode(yield* child.exited);
});
