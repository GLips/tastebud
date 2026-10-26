import { join } from "node:path";

import { Effect } from "effect";

import { RECORD_FOLDERS } from "#core/domains/records/index.ts";
import { starterTasteConfigText, TASTE_CONFIG_FILE } from "#core/domains/store-config/index.ts";
import { loadTasteConfig } from "#core/features/record-store/index.server.ts";
import { INDEX_DIR, listRecordFiles, storeFileExists, writeFileExclusive } from "#core/infrastructure/record-files.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

import { StoreAlreadyExists, StoreNotEmpty } from "../errors.ts";

/** How many record files the store at `root` holds; zero for a root that does not exist. */
export const countStoreRecordFiles = (root: string) => listRecordFiles(root, Object.values(RECORD_FOLDERS)).length;

/** Fails unless `root` holds neither records nor a config, as seeding needs. */
export const requireEmptyStore = Effect.fn("store-setup.requireEmptyStore")(function* (root: string) {
  const recordCount = countStoreRecordFiles(root);
  if (recordCount > 0) return yield* new StoreNotEmpty({ root, recordCount });
  if (storeFileExists(root, TASTE_CONFIG_FILE)) return yield* new StoreAlreadyExists({ root });
});

/** Writes `configText` as `taste.config.ts` and a `.gitignore` for the index. Folders appear on first write. */
export const writeNewStoreFiles = Effect.fn("store-setup.writeNewStoreFiles")(function* (
  root: string,
  configText: string,
) {
  if (storeFileExists(root, TASTE_CONFIG_FILE)) return yield* new StoreAlreadyExists({ root });
  yield* writeFileExclusive(join(root, TASTE_CONFIG_FILE), configText);
  if (!storeFileExists(root, ".gitignore")) yield* writeFileExclusive(join(root, ".gitignore"), `${INDEX_DIR}/\n`);
});

/** A new store at `root` with a commented starter config for `owner`. */
export const initTasteStore = Effect.fn("store-setup.initTasteStore")(function* (root: string, owner: string) {
  if (storeFileExists(root, TASTE_CONFIG_FILE)) return yield* new StoreAlreadyExists({ root });
  if (!/^human:\S+$/.test(owner))
    return yield* new InvalidTasteInput({ problems: [`owner must be human:<id>, not "${owner}"`] });
  yield* writeNewStoreFiles(root, starterTasteConfigText(owner));
  return yield* loadTasteConfig(root);
});
