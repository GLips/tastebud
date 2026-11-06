/**
 * The prompt hook's selection policy: merge the prompt's and the previous turn's matches, exclude
 * what a recent run already sent, and fit whole items into the output budget. Scores from the two
 * searches are never compared; the prompt's matches simply come first.
 */
import { Schema } from "effect";

import { formatScopeLabel } from "#core/domains/places/index.ts";
import type { RecallHit } from "#core/domains/record-views/index.ts";

import type { PreviousTurnEvidence, RecordedHookEmission } from "./hook-evidence.ts";
import { hookEmissionFingerprint, renderHookEmissionMarker } from "./hook-marker.ts";

/** The whole injected block, header and marker included, stays within this many characters. */
export const HOOK_OUTPUT_BUDGET_CHARS = 4096;

/** A derivation sent within this many owner turns is not sent again unless its state changed. */
export const HOOK_REPEAT_WINDOW_TURNS = 3;

const HOOK_HEADER =
  "These are previously accepted preferences relevant to this work. Apply them where relevant; the user's current explicit request takes precedence.";

/** Which search found a hook item: the prompt's own words, or the turn the prompt answers. */
export const HookMatchedBySchema = Schema.Literals(["prompt", "previous-turn"]);
export type HookMatchedBy = typeof HookMatchedBySchema.Type;

/** Why a selected item was not sent. */
export const HookExclusionSchema = Schema.Literals(["recently-emitted", "output-budget"]);
export type HookExclusion = typeof HookExclusionSchema.Type;

export interface HookCandidate {
  readonly hit: Omit<RecallHit, "sources">;
  readonly matchedBy: HookMatchedBy;
  readonly fingerprint: string;
}

export type HookExcludedCandidate = HookCandidate & { readonly exclusion: HookExclusion };

/** Prompt matches first, then previous-turn matches not already in; the first `limit` of those. */
export const mergeHookCandidates = (
  promptHits: ReadonlyArray<RecallHit>,
  previousTurnHits: ReadonlyArray<RecallHit>,
  limit: number,
): Array<HookCandidate> => {
  const seen = new Set<string>();
  const merged: Array<HookCandidate> = [];
  const add = (hits: ReadonlyArray<RecallHit>, matchedBy: HookMatchedBy) => {
    for (const { sources: _sources, ...hit } of hits) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      merged.push({ hit, matchedBy, fingerprint: hookEmissionFingerprint(hit.status, hit.effectiveScope) });
    }
  };
  add(promptHits, "prompt");
  add(previousTurnHits, "previous-turn");
  return merged.slice(0, limit);
};

const renderHookItemLine = (hit: HookCandidate["hit"]) =>
  `- ${hit.statement} (${hit.kindLabel}, ${formatScopeLabel(hit.effectiveScope)})`;

const renderHookBlock = (sent: ReadonlyArray<HookCandidate>) =>
  [
    HOOK_HEADER,
    ...sent.map((candidate) => renderHookItemLine(candidate.hit)),
    renderHookEmissionMarker(sent.map((candidate) => ({ id: candidate.hit.id, fingerprint: candidate.fingerprint }))),
  ].join("\n");

export interface HookSelection {
  readonly sent: ReadonlyArray<HookCandidate>;
  readonly excluded: ReadonlyArray<HookExcludedCandidate>;
  /** Absent when nothing is sent. */
  readonly additionalContext?: string;
}

/**
 * Suppression runs after selection, with no backfill: when every top item was sent recently, the
 * hook says nothing rather than reach for weaker matches. Items that would overflow the budget are
 * dropped whole, and a later, shorter one may still fit.
 */
export const selectHookItems = (
  candidates: ReadonlyArray<HookCandidate>,
  earlierEmissions: ReadonlyArray<RecordedHookEmission>,
): HookSelection => {
  const recent = new Set(
    earlierEmissions
      .filter((emission) => emission.ownerTurnsAgo < HOOK_REPEAT_WINDOW_TURNS)
      .map((emission) => `${emission.id}:${emission.fingerprint}`),
  );
  const excluded: Array<HookExcludedCandidate> = [];
  const sent: Array<HookCandidate> = [];
  for (const candidate of candidates) {
    if (recent.has(`${candidate.hit.id}:${candidate.fingerprint}`)) {
      excluded.push({ ...candidate, exclusion: "recently-emitted" });
      continue;
    }
    if (renderHookBlock([...sent, candidate]).length > HOOK_OUTPUT_BUDGET_CHARS) {
      excluded.push({ ...candidate, exclusion: "output-budget" });
      continue;
    }
    sent.push(candidate);
  }
  return sent.length === 0 ? { sent, excluded } : { sent, excluded, additionalContext: renderHookBlock(sent) };
};

/** Splits `camelCase` and `snake_case` identifiers, so code an edit wrote matches words in a statement. */
const splitIdentifiers = (text: string) => text.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2").replace(/[_$]+/g, " ");

/** The words the previous turn is searched by: what the agent said, and what its edits wrote. */
export const previousTurnSearchText = (evidence: PreviousTurnEvidence): string =>
  splitIdentifiers(`${evidence.assistantProse}\n${evidence.changedText}`);
