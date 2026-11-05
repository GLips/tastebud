import { join } from "node:path";

import { Effect, Result } from "effect";

import {
  type LoadedTastebudConfig,
  loadedTastebudConfigOf,
  TASTEBUD_CONFIG_FILE,
  type TastebudConfigFile,
  TastebudConfigFileSchema,
} from "#core/domains/store-config/index.ts";
import {
  importStoreConfigModule,
  importStoreConfigText,
  storeConfigModuleExists,
} from "#core/infrastructure/store-config-module.ts";
import { InvalidConfig, StoreNotInitialised } from "#core/infrastructure/store-errors.ts";

const loadedOrInvalid = (path: string, file: TastebudConfigFile) => {
  const loaded = loadedTastebudConfigOf(path, file);
  if (Result.isFailure(loaded)) return Effect.fail(new InvalidConfig({ path, problems: loaded.failure }));
  const config: LoadedTastebudConfig = loaded.success;
  return Effect.succeed(config);
};

/**
 * Loads and validates `<root>/tastebud.config.ts`. Bun runs TS natively; a long-running review server
 * sees edits without restarting.
 */
export const loadTastebudConfig = Effect.fn("record-store.loadTastebudConfig")(function* (root: string) {
  const path = join(root, TASTEBUD_CONFIG_FILE);
  if (!storeConfigModuleExists(path)) return yield* new StoreNotInitialised({ root });
  return yield* loadedOrInvalid(path, yield* importStoreConfigModule(path, TastebudConfigFileSchema));
});

/** `text` loaded as if it were the config at `path`: the same import, decode and catalog checks. */
export const loadTastebudConfigText = Effect.fn("record-store.loadTastebudConfigText")(function* (
  path: string,
  text: string,
) {
  return yield* loadedOrInvalid(path, yield* importStoreConfigText(path, text, TastebudConfigFileSchema));
});
