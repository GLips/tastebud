/**
 * The index's storage contract. The index knows files and rows, never records: the store feature
 * decodes each file into an `IndexRow` and decodes the stored body back when it loads rows.
 */
import type { Effect } from "effect";

import type { CorruptRecordFile } from "#core/shared/corrupt-record-file.ts";

/** One file as the index stores it. `body` is opaque text the caller decodes again on load. */
export interface IndexRow {
  readonly id: string;
  readonly type: string;
  readonly shortId: string;
  readonly body: string;
  /** Present for rows full-text search covers. */
  readonly search?: { readonly kind: string; readonly text: string } | undefined;
}

/** Turns a record file's path and text into its row; failing marks the file corrupt. */
export type IndexRowDecoder = (path: string, text: string) => Effect.Effect<IndexRow, CorruptRecordFile>;

/** What the record folders are and how each file becomes a row. */
export interface IndexFileSource {
  readonly folders: ReadonlyArray<string>;
  readonly decodeRow: IndexRowDecoder;
}

/** A stored row as loaded, in id order. */
export interface LoadedIndexRow {
  readonly body: string;
  /** Relative to the store root. */
  readonly path: string;
  readonly shortId: string;
}
