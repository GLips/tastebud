import type { Database } from "bun:sqlite";

import { Schema } from "effect";

const IndexSearchHitSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  kind: Schema.String,
  /** bm25: lower is a better match. */
  rank: Schema.Number,
});
export type IndexSearchHit = typeof IndexSearchHitSchema.Type;

const decodeIndexSearchHits = Schema.decodeUnknownSync(Schema.Array(IndexSearchHitSchema));

/** Which rows a search covers: one row type, optionally narrowed to some kinds. */
export interface IndexSearchFilter {
  readonly type: string;
  readonly kinds?: ReadonlyArray<string> | undefined;
}

/**
 * Full-text match on any of `tokens` (prefix match), best first. The caller tokenizes, so the index
 * and the repeat check agree on what a word is. Empty when there are no tokens.
 */
export const searchIndexRows = (
  db: Database,
  tokens: ReadonlyArray<string>,
  filter: IndexSearchFilter,
): ReadonlyArray<IndexSearchHit> => {
  const unique = [...new Set(tokens)];
  if (unique.length === 0 || filter.kinds?.length === 0) return [];
  const match = unique.map((token) => `"${token.replaceAll('"', '""')}"*`).join(" OR ");
  const kinds = filter.kinds ?? [];
  const kindClause = kinds.length === 0 ? "" : ` and kind in (${kinds.map(() => "?").join(", ")})`;
  return decodeIndexSearchHits(
    db
      .query(
        `select id, type, kind, bm25(search) as rank from search where search match ? and type = ?${kindClause} order by rank, id`,
      )
      .all(match, filter.type, ...kinds),
  );
};
