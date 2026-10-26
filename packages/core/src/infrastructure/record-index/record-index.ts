/** The bun:sqlite owner: `.index/taste.sqlite`, a disposable cache of the record files. */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { Effect, Schema } from "effect";

import type { CorruptRecordFile } from "#core/shared/corrupt-record-file.ts";

import { indexDirOf, listRecordFiles, readStoreFileText, type StoreFileStat } from "../record-files.ts";
import type { IndexFileSource, IndexRow, LoadedIndexRow } from "./index-rows.ts";

export const indexDatabasePath = (root: string) => join(indexDirOf(root), "taste.sqlite");

// Rows come back untyped from SQLite; each query's columns are decoded rather than asserted.
const decodeLayoutVersion = Schema.decodeUnknownSync(Schema.Struct({ user_version: Schema.Finite }));
const decodeFileRows = Schema.decodeUnknownSync(
  Schema.Array(Schema.Struct({ path: Schema.String, mtime: Schema.Finite })),
);
const decodeShortIdRows = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ short_id: Schema.String })));
const decodeRecordRows = Schema.decodeUnknownSync(
  Schema.Array(Schema.Struct({ json: Schema.String, path: Schema.String, short_id: Schema.String })),
);

/** Bumped when the tables change. The index is disposable, so a mismatch drops and rebuilds it. */
const INDEX_LAYOUT_VERSION = 2;

const createTables = (db: Database) => {
  const version = decodeLayoutVersion(db.query("pragma user_version").get()).user_version;
  if (version !== INDEX_LAYOUT_VERSION) {
    for (const table of ["files", "records", "search"]) db.run(`drop table if exists ${table}`);
    db.run(`pragma user_version = ${INDEX_LAYOUT_VERSION}`);
  }
  db.run("create table if not exists files (path text primary key, mtime real not null, id text not null)");
  // Status and reverse links are computed in TypeScript from every row, so records need no lookup columns.
  db.run(
    "create table if not exists records (id text primary key, type text not null, path text not null, short_id text not null, json text not null)",
  );
  db.run(
    "create virtual table if not exists search using fts5 (id unindexed, type unindexed, kind unindexed, text, tokenize = 'porter unicode61')",
  );
};

/**
 * Opens (creating if needed) `.index/taste.sqlite`. WAL plus a busy timeout because the CLI,
 * the review server and listeners all refresh the same index concurrently.
 */
export const openIndexDatabase = (root: string): Database => {
  mkdirSync(indexDirOf(root), { recursive: true });
  const db = new Database(indexDatabasePath(root), { create: true });
  db.run("pragma busy_timeout = 5000");
  db.run("pragma journal_mode = wal");
  createTables(db);
  return db;
};

/** Deletes the database files outright; `openIndexDatabase` recreates them. Leaves listener cursors alone. */
export const deleteIndexDatabase = (root: string) => {
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = `${indexDatabasePath(root)}${suffix}`;
    if (existsSync(path)) rmSync(path);
  }
};

const decodeFiles = (root: string, source: IndexFileSource, files: ReadonlyArray<StoreFileStat>) =>
  Effect.forEach(files, (file) =>
    source.decodeRow(file.path, readStoreFileText(root, file.path)).pipe(Effect.map((row) => ({ file, row }))),
  );

const insertRows = (db: Database, decoded: ReadonlyArray<{ file: StoreFileStat; row: IndexRow }>) => {
  const insertFile = db.prepare("insert or replace into files (path, mtime, id) values (?, ?, ?)");
  const insertRecord = db.prepare(
    "insert or replace into records (id, type, path, short_id, json) values (?, ?, ?, ?, ?)",
  );
  const clearSearch = db.prepare("delete from search where id = ?");
  const insertSearch = db.prepare("insert into search (id, type, kind, text) values (?, ?, ?, ?)");
  for (const { file, row } of decoded) {
    insertFile.run(file.path, file.mtimeMs, row.id);
    insertRecord.run(row.id, row.type, file.path, row.shortId, row.body);
    if (row.search !== undefined) {
      clearSearch.run(row.id);
      insertSearch.run(row.id, row.type, row.search.kind, row.search.text);
    }
  }
};

export interface IndexRefreshResult {
  readonly mode: "fresh" | "incremental" | "full";
  readonly recordCount: number;
}

/**
 * Brings the index in line with the files. Stale means any file's mtime or the file count differs
 * from what was recorded. Files are append-only, so new files are added incrementally; anything
 * else (a removed or touched file) triggers a full rebuild.
 */
export const refreshIndex = (
  db: Database,
  root: string,
  source: IndexFileSource,
): Effect.Effect<IndexRefreshResult, CorruptRecordFile> =>
  Effect.gen(function* () {
    const current = listRecordFiles(root, source.folders);
    const indexed = new Map(
      decodeFileRows(db.query("select path, mtime from files").all()).map((row) => [row.path, row.mtime]),
    );
    const currentPaths = new Set(current.map((file) => file.path));
    const needsFull =
      [...indexed.keys()].some((path) => !currentPaths.has(path)) ||
      current.some((file) => indexed.has(file.path) && indexed.get(file.path) !== file.mtimeMs);

    if (needsFull) {
      const decoded = yield* decodeFiles(root, source, current);
      db.transaction(() => {
        for (const table of ["files", "records", "search"]) db.run(`delete from ${table}`);
        insertRows(db, decoded);
      }).immediate();
      return { mode: "full", recordCount: decoded.length } as const;
    }

    const added = current.filter((file) => !indexed.has(file.path));
    if (added.length === 0) return { mode: "fresh", recordCount: current.length } as const;
    const decoded = yield* decodeFiles(root, source, added);
    db.transaction(() => insertRows(db, decoded)).immediate();
    return { mode: "incremental", recordCount: current.length } as const;
  });

export const loadIndexedShortIds = (db: Database): Set<string> =>
  new Set(decodeShortIdRows(db.query("select short_id from records").all()).map((row) => row.short_id));

export const loadIndexRows = (db: Database): Array<LoadedIndexRow> =>
  decodeRecordRows(db.query("select json, path, short_id from records order by id").all()).map((row) => ({
    body: row.json,
    path: row.path,
    shortId: row.short_id,
  }));
