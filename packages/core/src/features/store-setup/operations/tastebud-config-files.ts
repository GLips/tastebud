/**
 * The config operations' shared ground: where a store's config lives, what it holds now, and a
 * candidate text loaded exactly as the store would load it.
 */
import { join } from "node:path";

import { Effect, Schema } from "effect";

import { buildCatalogView, CatalogViewSchema } from "#core/domains/kind-catalog/index.ts";
import { type LoadedTastebudConfig, TASTEBUD_CONFIG_FILE } from "#core/domains/store-config/index.ts";
import { TasteStoreRoot } from "#core/features/record-store/index.server.ts";
import { hashStoreConfigText, readStoreConfigText } from "#core/infrastructure/store-config-module.ts";

/** A loaded config as agents read it: the kinds, owner, resolver and hook, plus the review port. */
export const TastebudConfigViewSchema = Schema.Struct({
  catalog: CatalogViewSchema,
  reviewPort: Schema.Finite,
});
export type TastebudConfigView = typeof TastebudConfigViewSchema.Type;

export const tastebudConfigViewOf = (config: LoadedTastebudConfig): TastebudConfigView => ({
  catalog: buildCatalogView({
    owner: config.owner,
    ownerName: config.ownerName,
    resolver: config.resolver.name,
    catalog: config.catalog,
    hook: config.hook,
  }),
  reviewPort: config.review.port,
});

/** The config file of the store at `root` as it is on disk: its path, and its text and hash if it exists. */
export interface CurrentTastebudConfigFile {
  readonly root: string;
  readonly path: string;
  readonly current: { readonly text: string; readonly hash: string } | undefined;
}

export const readCurrentTastebudConfigFile = Effect.fn("store-setup.readCurrentTastebudConfigFile")(function* (
  root: string,
) {
  const path = join(root, TASTEBUD_CONFIG_FILE);
  const text = yield* readStoreConfigText(path);
  const file: CurrentTastebudConfigFile = {
    root,
    path,
    current: text === undefined ? undefined : { text, hash: hashStoreConfigText(text) },
  };
  return file;
});

/** The config file of the store this operation runs for. */
export const readOperationTastebudConfigFile = Effect.gen(function* () {
  const { root } = yield* TasteStoreRoot;
  return yield* readCurrentTastebudConfigFile(root);
});

/** The whole-file text input the check and write share. */
export const TastebudConfigTextField = Schema.String.check(Schema.isMinLength(1)).annotate({
  description:
    "The complete tastebud.config.ts text, comments and all: start from config-show's text (or starter) and edit it",
});
