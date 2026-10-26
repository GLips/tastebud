import type { TasteRecord } from "./record-schemas.ts";

/** What full-text search indexes for one record: its kind and its searchable words. */
export interface RecordSearchEntry {
  readonly kind: string;
  readonly text: string;
}

/** Searchable records: a derivation's statement and reasoning, a source's quote. Others are not searched. */
export const recordSearchEntryOf = (record: TasteRecord): RecordSearchEntry | undefined => {
  if (record.type === "Derivation") return { kind: record.kind, text: `${record.statement}\n${record.reasoning}` };
  if (record.type === "Source") return { kind: record.kind, text: record.quote };
  return undefined;
};
