/** `catalog`: what an agent reads first, with the curator procedure on request. */
import { Effect, Schema } from "effect";

import { buildCatalogView, CatalogViewSchema, TASTEBUD_CURATOR_GUIDE } from "#core/domains/kind-catalog/index.ts";
import { TasteContextSchema } from "#core/domains/places/index.ts";
import type { TasteCaller } from "#core/domains/taste-caller/index.ts";
import { countPendingByKind } from "#core/features/inbox/index.server.ts";
import { resolveOperationContext } from "#core/features/place-context/index.server.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { resolveStoreRoot } from "#core/infrastructure/store-root.ts";
import { OptionalTrimmedText, OptionalTrimmedTextList } from "#core/shared/input-text.ts";

export const StoreCatalogInput = Schema.Struct({
  in: OptionalTrimmedText.annotate({ description: "Resolve the context as if in this directory" }),
  at: OptionalTrimmedTextList.annotate({ description: "Take these places as the context" }),
  guide: Schema.optionalKey(Schema.Boolean).annotate({
    description: "Also return the curator procedure: turning saved words into proposals for the owner",
  }),
});

export const StoreCatalogResultSchema = Schema.Struct({
  /** The curator procedure, when asked for with `guide`. */
  guide: Schema.optionalKey(Schema.String),
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
  input: typeof StoreCatalogInput.Type,
  caller: TasteCaller,
) {
  const store = yield* TasteStore;
  const { config } = store;
  const snapshot = yield* store.snapshot;
  return {
    ...(input.guide === true && { guide: TASTEBUD_CURATOR_GUIDE }),
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
