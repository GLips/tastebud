import { join } from "node:path";

import { Effect, Result } from "effect";

import {
  type LoadedTasteConfig,
  loadedTasteConfigOf,
  TASTE_CONFIG_FILE,
  type TasteConfigFile,
  TasteConfigFileSchema,
} from "#core/domains/store-config/index.ts";
import {
  importStoreConfigModule,
  importStoreConfigText,
  storeConfigModuleExists,
} from "#core/infrastructure/store-config-module.ts";
import { InvalidConfig, StoreNotInitialised } from "#core/infrastructure/store-errors.ts";

const loadedOrInvalid = (path: string, file: TasteConfigFile) => {
  const loaded = loadedTasteConfigOf(path, file);
  if (Result.isFailure(loaded)) return Effect.fail(new InvalidConfig({ path, problems: loaded.failure }));
  const config: LoadedTasteConfig = loaded.success;
  return Effect.succeed(config);
};

/**
 * Loads and validates `<root>/taste.config.ts`. Bun runs TS natively; a long-running review server
 * sees edits without restarting.
 */
export const loadTasteConfig = Effect.fn("record-store.loadTasteConfig")(function* (root: string) {
  const path = join(root, TASTE_CONFIG_FILE);
  if (!storeConfigModuleExists(path)) return yield* new StoreNotInitialised({ root });
  return yield* loadedOrInvalid(path, yield* importStoreConfigModule(path, TasteConfigFileSchema));
});

/** `text` loaded as if it were the config at `path`: the same import, decode and catalog checks. */
export const loadTasteConfigText = Effect.fn("record-store.loadTasteConfigText")(function* (
  path: string,
  text: string,
) {
  return yield* loadedOrInvalid(path, yield* importStoreConfigText(path, text, TasteConfigFileSchema));
});
