import { join } from "node:path";

import { Effect, Result } from "effect";

import {
  type LoadedTasteConfig,
  loadedTasteConfigOf,
  TASTE_CONFIG_FILE,
  TasteConfigFileSchema,
} from "#core/domains/store-config/index.ts";
import { importStoreConfigModule, storeConfigModuleExists } from "#core/infrastructure/store-config-module.ts";
import { InvalidConfig, StoreNotInitialised } from "#core/infrastructure/store-errors.ts";

/**
 * Loads and validates `<root>/taste.config.ts`. Bun runs TS natively; a long-running review server
 * sees edits without restarting.
 */
export const loadTasteConfig = Effect.fn("record-store.loadTasteConfig")(function* (root: string) {
  const path = join(root, TASTE_CONFIG_FILE);
  if (!storeConfigModuleExists(path)) return yield* new StoreNotInitialised({ root });
  const file = yield* importStoreConfigModule(path, TasteConfigFileSchema);
  const loaded = loadedTasteConfigOf(path, file);
  if (Result.isFailure(loaded)) return yield* new InvalidConfig({ path, problems: loaded.failure });
  const config: LoadedTasteConfig = loaded.success;
  return config;
});
