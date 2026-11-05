import { Effect } from "effect";

import { runReviewOperation, runReviewOperations } from "#review/infrastructure/tastebud-core.server.ts";

export const readCatalogAndCounts = () =>
  runReviewOperations((run) =>
    Effect.gen(function* () {
      const { catalog, storeRoot, storeIsDefault, pendingByKind } = yield* run("catalog", {});
      return { catalog, storeRoot, storeIsDefault, pendingByKind };
    }),
  );

export const readCatalogContext = (request: { readonly in?: string; readonly at?: ReadonlyArray<string> }) =>
  runReviewOperation("catalog", request);

export const readRecordWithListeners = (ref: string) =>
  runReviewOperations((run) =>
    Effect.gen(function* () {
      const shown = yield* run("show", { ref });
      const { listeners } = yield* run("listeners", {});
      return { ...shown, listeners };
    }),
  );

export const readPlacesInUse = () => runReviewOperation("places", {});
