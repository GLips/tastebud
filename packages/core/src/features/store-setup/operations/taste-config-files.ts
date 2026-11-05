/**
 * The config operations' shared ground: where a store's config lives, what it holds now, and a
 * candidate text loaded exactly as the store would load it.
 */
import { join } from "node:path";

import { Effect, Schema } from "effect";

import { buildCatalogView, CatalogViewSchema } from "#core/domains/kind-catalog/index.ts";
import { type LoadedTasteConfig, TASTE_CONFIG_FILE } from "#core/domains/store-config/index.ts";
import { TasteStoreRoot } from "#core/features/record-store/index.server.ts";
import { hashStoreConfigText, readStoreConfigText } from "#core/infrastructure/store-config-module.ts";

/** A loaded config as agents read it: the kinds, owner, resolver and hook, plus the review port. */
export const TasteConfigViewSchema = Schema.Struct({
  catalog: CatalogViewSchema,
  reviewPort: Schema.Finite,
});
export type TasteConfigView = typeof TasteConfigViewSchema.Type;

export const tasteConfigViewOf = (config: LoadedTasteConfig): TasteConfigView => ({
  catalog: buildCatalogView({
    owner: config.owner,
    resolver: config.resolver.name,
    catalog: config.catalog,
    hook: config.hook,
  }),
  reviewPort: config.review.port,
});

/** The config file of the store at `root` as it is on disk: its path, and its text and hash if it exists. */
export interface CurrentTasteConfigFile {
  readonly root: string;
  readonly path: string;
  readonly current: { readonly text: string; readonly hash: string } | undefined;
}

export const readCurrentTasteConfigFile = Effect.fn("store-setup.readCurrentTasteConfigFile")(function* (root: string) {
  const path = join(root, TASTE_CONFIG_FILE);
  const text = yield* readStoreConfigText(path);
  const file: CurrentTasteConfigFile = {
    root,
    path,
    current: text === undefined ? undefined : { text, hash: hashStoreConfigText(text) },
  };
  return file;
});

/** The config file of the store this operation runs for. */
export const readOperationTasteConfigFile = Effect.gen(function* () {
  const { root } = yield* TasteStoreRoot;
  return yield* readCurrentTasteConfigFile(root);
});

/** The whole-file text input the check and write share. */
export const TasteConfigTextField = Schema.String.check(Schema.isMinLength(1)).annotate({
  description:
    "The complete taste.config.ts text, comments and all: start from config-show's text (or starter) and edit it",
});
