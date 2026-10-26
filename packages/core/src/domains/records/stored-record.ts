import type { TasteRecord } from "./record-schemas.ts";

/** A record together with the file that holds it. Unwritten records have an empty path and short id. */
export interface StoredRecord<R extends TasteRecord = TasteRecord> {
  readonly record: R;
  /** Relative to the store root. */
  readonly path: string;
  readonly shortId: string;
}
