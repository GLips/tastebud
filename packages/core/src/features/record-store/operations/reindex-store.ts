import { Schema } from "effect";

import type { IndexRefreshResult } from "#core/infrastructure/record-index/record-index.ts";

import { TasteStore } from "./taste-store.ts";

export const IndexRefreshResultSchema = Schema.Struct({
  mode: Schema.Literals(["fresh", "incremental", "full"]),
  recordCount: Schema.Finite,
});

/** Deletes `.index/` and rebuilds it from the record files. */
export const reindexTasteStore = TasteStore.use((store) => store.rebuild);

export const renderReindexText = (result: IndexRefreshResult) => `Reindexed ${result.recordCount} records.`;
