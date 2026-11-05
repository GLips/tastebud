import { Effect, Option } from "effect";

import { resolveCliStoreRoot } from "#cli/features/cli-operations/index.server.ts";
import { serveReviewApp } from "#cli/infrastructure/review-app-server.ts";
import { pinTasteStoreForThisProcess, provideTasteStore, TasteStore } from "#cli/infrastructure/taste-core.ts";
import { printLine } from "#cli/infrastructure/terminal.ts";

/** Serves the review UI against the store until the process is ended (Ctrl-C). */
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
  // The server functions resolve their store per call from TASTE_STORE, so they serve this one.
  yield* Effect.sync(() => pinTasteStoreForThisProcess(root));
  yield* serveReviewApp(port);
  const url = `http://127.0.0.1:${port}/`;
  yield* printLine(json ? JSON.stringify({ url, store: root }) : `Taste review: ${url}  (store ${root})`);
  return yield* Effect.never;
});
