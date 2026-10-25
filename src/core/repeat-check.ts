/**
 * The repeat check: within one kind, across every status, against effective scopes. A near repeat
 * whose scope overlaps blocks; one with a disjoint scope is only related.
 */
import { Effect } from "effect";

import { type DerivationScope, scopesOverlap } from "../shared/places.ts";
import { normaliseText, RELATED_FTS_TOP, RELATED_THRESHOLD, REPEAT_THRESHOLD, tokenJaccard } from "./similarity.ts";
import { derivationStateOf, TasteStore } from "./store.ts";
import type { RepeatMatch } from "./view-schemas.ts";
import { summarizeDerivation, type ViewSource } from "./views.ts";

export interface RepeatCandidate {
  readonly kind: string;
  readonly statement: string;
  readonly scope: DerivationScope;
  /** Never matched: the candidate itself and the derivation it supersedes. */
  readonly excludeIds: ReadonlyArray<string>;
}

export interface RepeatCheckResult {
  /** Near repeats with overlapping scopes. They block unless named by `despite` or `acknowledges`. */
  readonly blocking: ReadonlyArray<RepeatMatch>;
  /** Weaker matches, and near repeats with disjoint scopes. Never blocking. */
  readonly related: ReadonlyArray<RepeatMatch>;
}

const bySimilarity = (left: RepeatMatch, right: RepeatMatch) =>
  right.similarity - left.similarity || left.id.localeCompare(right.id);

/** Pure over a snapshot plus the full-text hits for the statement within its kind (best first). */
const classifyRepeatMatches = (
  view: ViewSource,
  candidate: RepeatCandidate,
  textHitIds: ReadonlyArray<string>,
): RepeatCheckResult => {
  const exclude = new Set(candidate.excludeIds);
  const normalised = normaliseText(candidate.statement);
  const topHits = new Set(textHitIds.filter((id) => !exclude.has(id)).slice(0, RELATED_FTS_TOP));
  const blocking: Array<RepeatMatch> = [];
  const related: Array<RepeatMatch> = [];
  for (const derivation of view.snapshot.derivations) {
    if (derivation.kind !== candidate.kind || exclude.has(derivation.id)) continue;
    const similarity = tokenJaccard(candidate.statement, derivation.statement);
    const near =
      similarity >= REPEAT_THRESHOLD || (normalised !== "" && normaliseText(derivation.statement) === normalised);
    if (!near && similarity < RELATED_THRESHOLD && !topHits.has(derivation.id)) continue;
    const match: RepeatMatch = { ...summarizeDerivation(view, derivation), similarity };
    const overlaps = scopesOverlap(candidate.scope, derivationStateOf(view.snapshot, derivation).effectiveScope);
    (near && overlaps ? blocking : related).push(match);
  }
  return { blocking: blocking.sort(bySimilarity), related: related.sort(bySimilarity) };
};

export const findRepeatMatches = Effect.fn("taste.findRepeatMatches")(function* (
  view: ViewSource,
  candidate: RepeatCandidate,
) {
  const store = yield* TasteStore;
  const hits = yield* store.search(candidate.statement, { type: "Derivation", kinds: [candidate.kind] });
  return classifyRepeatMatches(
    view,
    candidate,
    hits.map((hit) => hit.id),
  );
});
