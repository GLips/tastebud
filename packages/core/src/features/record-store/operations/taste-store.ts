/**
 * The open store: its root, a config snapshot, and records read through the index. The index is
 * private; every read brings it in line with the record files first, so no caller sees a stale or
 * deleted index. The snapshot is built by the record-snapshot domain from the stored records.
 */
import { Context, Effect, Layer, Schema } from "effect";

import { buildStoreSnapshot, type StoreSnapshot } from "#core/domains/record-snapshot/index.ts";
import {
  RECORD_FOLDERS,
  recordRelativePath,
  recordSearchEntryOf,
  shortIdFromPath,
  type StoredRecord,
  type TasteRecord,
  TasteRecordSchema,
  uniqueShortId,
} from "#core/domains/records/index.ts";
import { normaliseTokens } from "#core/domains/repeat-detection/index.ts";
import type { LoadedTasteConfig } from "#core/domains/store-config/index.ts";
import { storeFilePath, writeFileExclusive } from "#core/infrastructure/record-files.ts";
import {
  type IndexHandle,
  openIndexHandle,
  recreateIndex,
  reopenIndexIfReplaced,
} from "#core/infrastructure/record-index/index-handle.ts";
import type { IndexFileSource } from "#core/infrastructure/record-index/index-rows.ts";
import { searchIndexRows } from "#core/infrastructure/record-index/index-search.ts";
import {
  type IndexRefreshResult,
  loadIndexedShortIds,
  loadIndexRows,
  refreshIndex,
} from "#core/infrastructure/record-index/record-index.ts";
import type { InvalidConfig, StoreNotInitialised, StoreWriteFailed } from "#core/infrastructure/store-errors.ts";
import type { CorruptRecordFile } from "#core/shared/corrupt-record-file.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";
import { formatSchemaProblems } from "#core/shared/schema-problems.ts";

import { loadTasteConfig } from "./load-taste-config.ts";
import { decodeRecordFileText, renderRecordFileText } from "./record-file-text.ts";

export interface TasteSearchHit {
  readonly id: string;
  readonly type: "Source" | "Derivation";
  readonly kind: string;
  /** bm25: lower is a better match. */
  readonly rank: number;
}

/** Which records a search covers: one record type, optionally narrowed to some kinds. */
export interface TasteSearchFilter {
  readonly type: "Source" | "Derivation";
  readonly kinds?: ReadonlyArray<string>;
}

const RECORD_INDEX_SOURCE: IndexFileSource = {
  folders: Object.values(RECORD_FOLDERS),
  decodeRow: (path, text) =>
    Effect.map(decodeRecordFileText(path, text), (record) => ({
      id: record.id,
      type: record.type,
      shortId: shortIdFromPath(path),
      body: JSON.stringify(record),
      search: recordSearchEntryOf(record),
    })),
};

const validateRecord = Schema.decodeUnknownEffect(TasteRecordSchema);
/** Rows were checked when their files were parsed; decoding again only restores the type. */
const decodeIndexedRecord = Schema.decodeUnknownSync(TasteRecordSchema);

export class TasteStore extends Context.Service<
  TasteStore,
  {
    readonly root: string;
    /** The config as of this operation; `runTasteOperation` provides a fresh one for each run. */
    readonly config: LoadedTasteConfig;
    /** Reads `taste.config.ts` again; cheap when its mtime is unchanged. */
    readonly loadConfig: Effect.Effect<LoadedTasteConfig, StoreNotInitialised | InvalidConfig>;
    /** Every record with its file, in id order. */
    readonly records: Effect.Effect<ReadonlyArray<StoredRecord>, CorruptRecordFile>;
    /** Every record, with derivation statuses derived. Every read path starts here. */
    readonly snapshot: Effect.Effect<StoreSnapshot, CorruptRecordFile>;
    /** Full-text hits over derivation statements and reasoning, or source quotes, best first. */
    readonly search: (
      text: string,
      filter: TasteSearchFilter,
    ) => Effect.Effect<Array<TasteSearchHit>, CorruptRecordFile>;
    /** Validates with Schema, writes the file with exclusive create, then refreshes the index. */
    readonly write: <R extends TasteRecord>(
      record: R,
    ) => Effect.Effect<StoredRecord<R>, InvalidTasteInput | StoreWriteFailed | CorruptRecordFile>;
    /** Deletes the sqlite files and rebuilds them from the record files. */
    readonly rebuild: Effect.Effect<IndexRefreshResult, CorruptRecordFile>;
  }
>()("@taste/TasteStore") {}

/** Opens the store at `root`, loading its config. Closes the index when the scope ends. */
const makeTasteStoreLayer = (root: string): Layer.Layer<TasteStore, StoreNotInitialised | InvalidConfig> =>
  Layer.effect(
    TasteStore,
    Effect.gen(function* () {
      const config = yield* loadTasteConfig(root);
      let index: IndexHandle = yield* Effect.acquireRelease(
        Effect.sync(() => openIndexHandle(root)),
        () => Effect.sync(() => index.current.close()),
      );
      const freshIndex = Effect.suspend(() => {
        index = reopenIndexIfReplaced(root, index);
        return refreshIndex(index.current, root, RECORD_INDEX_SOURCE).pipe(Effect.as(index.current));
      });
      const records = Effect.map(freshIndex, (db) =>
        loadIndexRows(db).map((row): StoredRecord => ({
          record: decodeIndexedRecord(JSON.parse(row.body)),
          path: row.path,
          shortId: row.shortId,
        })),
      );
      // Rows are inserted with their record's own type, so the search type is one of the filter's.
      const search = (text: string, filter: TasteSearchFilter) =>
        Effect.map(freshIndex, (db) =>
          searchIndexRows(db, normaliseTokens(text), filter).map((hit): TasteSearchHit => ({
            id: hit.id,
            type: filter.type,
            kind: hit.kind,
            rank: hit.rank,
          })),
        );

      return TasteStore.of({
        root,
        config,
        loadConfig: loadTasteConfig(root),
        records,
        snapshot: Effect.map(records, buildStoreSnapshot),
        search,
        write: (record) =>
          Effect.gen(function* () {
            yield* validateRecord(record, { errors: "all", onExcessProperty: "error" }).pipe(
              Effect.mapError((error) => new InvalidTasteInput({ problems: formatSchemaProblems(error) })),
            );
            const shortId = uniqueShortId(record.id, loadIndexedShortIds(yield* freshIndex));
            const path = recordRelativePath(record, shortId);
            yield* writeFileExclusive(storeFilePath(root, path), renderRecordFileText(record));
            yield* freshIndex;
            return { record, path, shortId };
          }),
        rebuild: Effect.suspend(() => {
          index = recreateIndex(root, index);
          return refreshIndex(index.current, root, RECORD_INDEX_SOURCE);
        }),
      });
    }),
  );

/**
 * Runs `effect` against the store with its config re-read first, so a long-lived store (the review
 * server, MCP) sees config edits. The index connection is shared.
 */
export const withFreshTasteConfig = Effect.fn("record-store.withFreshTasteConfig")(function* <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.fn.Return<A, E | StoreNotInitialised | InvalidConfig, R | TasteStore> {
  const store = yield* TasteStore;
  const config = yield* store.loadConfig;
  return yield* Effect.provideService(effect, TasteStore, TasteStore.of({ ...store, config }));
});

/** Provides an open store to `effect` and closes its index afterwards. */
export const provideTasteStore =
  (root: string) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | StoreNotInitialised | InvalidConfig, Exclude<R, TasteStore>> =>
    Effect.provide(effect, makeTasteStoreLayer(root));
