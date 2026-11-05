/** `catalog`: what an agent reads first. */
import { Effect, Schema } from "effect";

import { buildCatalogView, CatalogViewSchema } from "#core/domains/kind-catalog/index.ts";
import { TasteContextSchema } from "#core/domains/places/index.ts";
import type { ContextOverrideInput, TasteCaller } from "#core/domains/taste-caller/index.ts";
import { countPendingByKind } from "#core/features/inbox/index.server.ts";
import { resolveOperationContext } from "#core/features/place-context/index.server.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { resolveStoreRoot } from "#core/infrastructure/store-root.ts";

export const StoreCatalogResultSchema = Schema.Struct({
  catalog: CatalogViewSchema,
  storeRoot: Schema.String,
  /** The store is `~/.tastebud`, so connecting a host needs no store argument or setting. */
  storeIsDefault: Schema.Boolean,
  context: TasteContextSchema,
  /** Pending derivations per live kind, awaiting the owner in the review UI. */
  pendingByKind: Schema.Record(Schema.String, Schema.Finite),
});

/** The kinds this store holds, how to propose each, where the caller is, and the store root. */
export const readStoreCatalog = Effect.fn("store-catalog.readStoreCatalog")(function* (
  input: ContextOverrideInput,
  caller: TasteCaller,
) {
  const store = yield* TasteStore;
  const { config } = store;
  const snapshot = yield* store.snapshot;
  return {
    pendingByKind: countPendingByKind({ snapshot, catalog: config.catalog }),
    catalog: buildCatalogView({
      owner: config.owner,
      resolver: config.resolver.name,
      catalog: config.catalog,
      hook: config.hook,
    }),
    storeRoot: store.root,
    storeIsDefault: store.root === resolveStoreRoot({}),
    context: yield* resolveOperationContext(input, caller),
  };
});
