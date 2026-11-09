/** Recall's outcomes in plain words: why an item was left out, why nothing was sent, why it applies. */
import { HOOK_OUTPUT_BUDGET_CHARS, HOOK_REPEAT_WINDOW_TURNS } from "@tastebud/core/hook-evidence";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { HookPayload, RecallExplainItem } from "@tastebud/core/recall";
import type { ExcludedRecallHit, RecallExclusionReason, RecallResult } from "@tastebud/core/record-views";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { capitalize, findKindView } from "#review/shared/ui/kind-identity.tsx";
import type { RecallOutcomeTone } from "#review/shared/ui/outcome-chip.tsx";

/** Why an accepted recall hit is there on request rather than sent with the prompt. */
const availableThroughRecallReason = (
  hit: Pick<RecallResult["accepted"][number], "kind" | "kindLabel" | "explanation">,
  catalog: CatalogView | undefined,
  hookLimit: number,
): string => {
  if (hit.explanation.policy !== "pull") return `Not sent: at most ${hookLimit} go with one prompt`;
  const kind = findKindView(catalog, hit.kind);
  return `${capitalize(kind?.plural ?? hit.kindLabel)} are only given when an agent asks`;
};

/** Why a matching item doesn't reach agents here, as a clause that reads after "but". */
const exclusionReason = (
  hit: Pick<ExcludedRecallHit, "kind" | "kindLabel" | "status" | "exclusion" | "effectiveScope">,
  catalog: CatalogView | undefined,
  known: KnownPlaces,
): string => {
  const kind = findKindView(catalog, hit.kind);
  const scope = hit.effectiveScope;
  const reasons: Record<RecallExclusionReason, string> = {
    "out-of-scope": `scoped to ${scope.scope === "global" ? "everywhere" : scope.places.map(known.labelOf).join(", ")}`,
    "never-policy": `${kind?.plural ?? hit.kindLabel} stay in your backlog, never sent`,
    pending: "still waiting for your decision",
    "history-not-requested": `${hit.status}; shown only when you include replaced and retracted`,
    "kind-not-selected": `${kind?.plural ?? hit.kind} are filtered out above`,
    "retired-kind": "its kind was removed from this store",
  };
  return reasons[hit.exclusion];
};

export const hookSilenceWording = (hook: HookPayload, catalog: CatalogView | undefined): string | undefined => {
  switch (hook.silence) {
    case "unknown-context":
      return "Tastebud can't tell where the agent is, so it sends nothing rather than guess.";
    case "no-inject-kinds":
      return "No kind in this store is sent with prompts.";
    case "timed-out":
      return `Finding matches took longer than ${catalog?.hook.budgetMs ?? 650} ms, so nothing was sent.`;
    case "no-matches":
      return "Nothing that may be sent here matches these words.";
    case "recently-emitted":
      return `Everything it would send was already sent within the last ${HOOK_REPEAT_WINDOW_TURNS} turns.`;
    case "output-budget":
      return `Nothing it would send fits in ${HOOK_OUTPUT_BUDGET_CHARS} characters.`;
    case undefined:
      return "";
  }
};

type RecallReachedItem = Exclude<RecallExplainItem, { outcome: "excluded" }>;

const RECALL_SECTION_WORDING: Record<RecallReachedItem["section"], (item: RecallReachedItem) => string> = {
  accepted: () => "Accepted.",
  rejected: () => "You rejected this; agents are told so, so they don't propose it again.",
  history: (item) => `${capitalize(item.status)}: shown because you included replaced and retracted.`,
};

/** Core's explanation of one item, in words: whether it reaches agents where the inspector stands, and how. */
export function recallExplanationLines(
  item: RecallExplainItem,
  catalog: CatalogView | undefined,
  known: KnownPlaces,
): ReadonlyArray<string> {
  if (item.outcome === "excluded") return [`Agents don't get it here: ${exclusionReason(item, catalog, known)}.`];
  const matched = item.explanation.matchedPlace;
  return [
    RECALL_SECTION_WORDING[item.section](item),
    matched === "global" ? "It applies everywhere." : `It applies in ${known.labelOf(matched)}.`,
    item.outcome === "injected"
      ? "It is sent with a prompt whose words match, and agents can look it up."
      : "Agents get it when they look up matching words; it is never sent with a prompt here.",
  ];
}

/**
 * A row's outcome in Recall's answer: the chip's tone, a narrower word in that tone when the tone's own word
 * isn't enough ("History"), and the why in full. The row's status sits in its own column.
 */
export interface RecallOutcome {
  readonly tone: RecallOutcomeTone;
  readonly label?: string;
  readonly why?: string;
}

const placeWhy = (matched: string, known: KnownPlaces) =>
  matched === "global" ? "Applies everywhere" : `Applies in ${known.labelOf(matched)}`;

export const sentOutcome = (matched: string, known: KnownPlaces): RecallOutcome => ({
  tone: "sent",
  why: placeWhy(matched, known),
});

/** Accepted and matched, but only there when an agent asks. */
export const onRequestOutcome = (
  hit: Pick<RecallResult["accepted"][number], "kind" | "kindLabel" | "explanation">,
  catalog: CatalogView | undefined,
  hookLimit: number,
): RecallOutcome => ({ tone: "on-request", why: availableThroughRecallReason(hit, catalog, hookLimit) });

export const rejectionOutcome = (hit: Pick<RecallResult["rejected"][number], "reason">): RecallOutcome => ({
  tone: "not-sent",
  label: "Told no",
  why: `Agents are told you said no${hit.reason === undefined ? "" : `: “${hit.reason}”`}`,
});

// Only a scope holds an item back; every other exclusion is not sent, some with a narrower word.
const EXCLUSION_CHIPS: Record<RecallExclusionReason, Pick<RecallOutcome, "tone" | "label">> = {
  "out-of-scope": { tone: "held-back" },
  "never-policy": { tone: "not-sent" },
  pending: { tone: "not-sent" },
  "history-not-requested": { tone: "not-sent", label: "History" },
  "kind-not-selected": { tone: "not-sent", label: "Filtered out" },
  "retired-kind": { tone: "not-sent", label: "Retired kind" },
};

/** A match that doesn't reach agents here. */
export const exclusionOutcome = (
  hit: Pick<ExcludedRecallHit, "kind" | "kindLabel" | "status" | "exclusion" | "effectiveScope">,
  catalog: CatalogView | undefined,
  known: KnownPlaces,
): RecallOutcome => ({ ...EXCLUSION_CHIPS[hit.exclusion], why: capitalize(exclusionReason(hit, catalog, known)) });

export const HISTORY_OUTCOME: RecallOutcome = {
  tone: "not-sent",
  label: "History",
  why: "Shown because you included replaced and retracted",
};

/** Applies where the agent stands, but these words didn't bring it up. No why: the chip says it, row after row. */
export const UNMATCHED_OUTCOME: RecallOutcome = { tone: "not-matched" };
