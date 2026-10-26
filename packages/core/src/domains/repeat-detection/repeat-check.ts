/**
 * The repeat check: within one kind, across every status, against effective scopes. A near repeat
 * whose scope overlaps blocks; one with a disjoint scope is only related.
 */
import { type DerivationScope, formatScopeLabel, scopesOverlap } from "#core/domains/places/index.ts";
import { derivationById, derivationStateOf, type StoreSnapshot } from "#core/domains/record-snapshot/index.ts";
import { type RepeatMatch, summarizeDerivation, type ViewSource } from "#core/domains/record-views/index.ts";

import { normaliseText, RELATED_THRESHOLD, REPEAT_THRESHOLD, tokenJaccard } from "./token-similarity.ts";

export interface RepeatCandidate {
  readonly kind: string;
  readonly statement: string;
  readonly scope: DerivationScope;
  /** Never matched: the candidate itself and its supersession lineage. */
  readonly excludeIds: ReadonlyArray<string>;
}

export interface RepeatCheckResult {
  /** Near repeats with overlapping scopes. They block unless named by `despite` or `acknowledges`. */
  readonly blocking: ReadonlyArray<RepeatMatch>;
  /** Weaker matches, and near repeats with disjoint scopes. Never blocking. */
  readonly related: ReadonlyArray<RepeatMatch>;
}

/**
 * `supersedesId` and every earlier version it superseded in turn. They are one derivation's history,
 * so a revision is never a repeat of them.
 */
export const supersessionLineageOf = (snapshot: StoreSnapshot, supersedesId: string | undefined) => {
  const lineage: Array<string> = [];
  for (let id = supersedesId; id !== undefined && !lineage.includes(id); id = derivationById(snapshot, id)?.supersedes)
    lineage.push(id);
  return lineage;
};

const bySimilarity = (left: RepeatMatch, right: RepeatMatch) =>
  right.similarity - left.similarity || left.id.localeCompare(right.id);

/**
 * Pure over a snapshot. Below `RELATED_THRESHOLD` a match shares only a word or two, so it is left
 * out everywhere: a proposal's `related`, the inbox card and the accept preview list the same matches.
 */
export const findRepeatMatches = (view: ViewSource, candidate: RepeatCandidate): RepeatCheckResult => {
  const exclude = new Set(candidate.excludeIds);
  const normalised = normaliseText(candidate.statement);
  const blocking: Array<RepeatMatch> = [];
  const related: Array<RepeatMatch> = [];
  for (const derivation of view.snapshot.derivations) {
    if (derivation.kind !== candidate.kind || exclude.has(derivation.id)) continue;
    const similarity = tokenJaccard(candidate.statement, derivation.statement);
    const near =
      similarity >= REPEAT_THRESHOLD || (normalised !== "" && normaliseText(derivation.statement) === normalised);
    if (!near && similarity < RELATED_THRESHOLD) continue;
    const match: RepeatMatch = { ...summarizeDerivation(view, derivation), similarity };
    const overlaps = scopesOverlap(candidate.scope, derivationStateOf(view.snapshot, derivation).effectiveScope);
    (near && overlaps ? blocking : related).push(match);
  }
  return { blocking: blocking.sort(bySimilarity), related: related.sort(bySimilarity) };
};

/** One indented line per match, as the near-repeat and widening refusals list them. */
export const formatRepeatMatchLines = (matches: ReadonlyArray<RepeatMatch>) =>
  matches.map(
    (match) =>
      `  - "${match.statement}" [${match.id}] ${match.status}, similarity ${match.similarity.toFixed(2)}, ` +
      `scope ${formatScopeLabel(match.effectiveScope)}${match.reason === undefined ? "" : `, reason: ${match.reason}`}`,
  );
