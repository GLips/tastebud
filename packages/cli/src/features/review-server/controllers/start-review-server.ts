import { Effect, Option } from "effect";

import { resolveCliStoreRoot } from "#cli/features/cli-operations/index.server.ts";
import { openInBrowser } from "#cli/infrastructure/browser-opener.ts";
import { probeReviewServerStore, serveReviewApp } from "#cli/infrastructure/review-app-server.ts";
import { pinTasteStoreForThisProcess, provideTasteStore, TasteStore } from "#cli/infrastructure/tastebud-core.ts";
import { printLine } from "#cli/infrastructure/terminal.ts";

/**
 * Serves the review UI against the store until the process is ended (Ctrl-C). With `open`, a server already
 * serving this store on the port is reused: its URL is printed and opened, and the command exits.
 */
export const startReviewServer = Effect.fn("review-server.startReviewServer")(function* (
  portOverride: Option.Option<number>,
  open: boolean,
  json: boolean,
  store: Option.Option<string>,
) {
  const root = resolveCliStoreRoot(store);
  // Fails with StoreNotInitialised before a server starts against nothing.
  const configuredPort = yield* provideTasteStore(root)(
    TasteStore.use((tasteStore) => Effect.succeed(tasteStore.config.review.port)),
  );
  const port = Option.getOrElse(portOverride, () => configuredPort);
  const url = `http://127.0.0.1:${port}/`;
  const announce = printLine(json ? JSON.stringify({ url, store: root }) : `Tastebud review: ${url}  (store ${root})`);
  // A port held by another store or app falls through to serving, so ReviewPortTaken names it.
  const servedStore = open ? yield* probeReviewServerStore(port) : Option.none<string>();
  if (Option.contains(servedStore, root)) {
    yield* announce;
    return yield* openInBrowser(url);
  }
  // The server functions resolve their store per call from TASTEBUD_STORE, so they serve this one.
  yield* Effect.sync(() => pinTasteStoreForThisProcess(root));
  yield* serveReviewApp(port, root);
  yield* announce;
  if (open) yield* openInBrowser(url);
  return yield* Effect.never;
});
