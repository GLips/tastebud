import { Effect } from "effect";

import { RECORD_FOLDERS } from "#core/domains/records/index.ts";
import { listRecordFiles } from "#core/infrastructure/record-files.ts";

import { StoreNotEmpty } from "../errors.ts";

/** How many record files the store at `root` holds; zero for a root that does not exist. */
export const countStoreRecordFiles = (root: string) => listRecordFiles(root, Object.values(RECORD_FOLDERS)).length;

/** Fails when `root` already holds records, as seeding needs. A config there fails at the config write. */
export const requireNoStoreRecords = Effect.fn("store-setup.requireNoStoreRecords")(function* (root: string) {
  const recordCount = countStoreRecordFiles(root);
  if (recordCount > 0) return yield* new StoreNotEmpty({ root, recordCount });
});
