import type { Database } from "bun:sqlite";
import { statSync } from "node:fs";

import { deleteIndexDatabase, indexDatabasePath, openIndexDatabase } from "./record-index.ts";

/** An open index and the inode it was opened on; a different or missing one means `.index/` was deleted under us. */
export interface IndexHandle {
  readonly current: Database;
  readonly inode: number;
}

export const openIndexHandle = (root: string): IndexHandle => {
  const current = openIndexDatabase(root);
  return { current, inode: statSync(indexDatabasePath(root)).ino };
};

/**
 * The handle to use now. A long-lived process (`tastebud review listen`) keeps one connection; if
 * someone deletes `.index/`, it points at an unlinked file and SQLite fails with "disk I/O error".
 */
export const reopenIndexIfReplaced = (root: string, handle: IndexHandle): IndexHandle => {
  const inode = statSync(indexDatabasePath(root), { throwIfNoEntry: false })?.ino;
  if (inode === handle.inode) return handle;
  handle.current.close();
  return openIndexHandle(root);
};

/** Closes the handle, deletes the database files and opens an empty index. */
export const recreateIndex = (root: string, handle: IndexHandle): IndexHandle => {
  handle.current.close();
  deleteIndexDatabase(root);
  return openIndexHandle(root);
};
