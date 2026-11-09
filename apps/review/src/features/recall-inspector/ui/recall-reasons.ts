/** Recall's outcomes in plain words: why an item was left out, why nothing was sent, why it applies. */
import { HOOK_OUTPUT_BUDGET_CHARS, HOOK_REPEAT_WINDOW_TURNS } from "@tastebud/core/hook-evidence";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { HookPayload, RecallExplainItem } from "@tastebud/core/recall";
import type { ExcludedRecallHit, RecallExclusionReason, RecallResult } from "@tastebud/core/record-views";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { capitalize, findKindView } from "#review/shared/ui/kind-identity.tsx";

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

/** A row's outcome in Recall's answer: a chip, and a short why (the full sentence in its tooltip). */
export interface RecallOutcome {
  readonly label: string;
  readonly color: string;
  readonly why?: string;
  readonly whyInFull?: string;
}

const placeWhy = (matched: string, known: KnownPlaces) =>
  matched === "global" ? "Applies everywhere" : `Applies in ${known.labelOf(matched)}`;

export const sentOutcome = (matched: string, known: KnownPlaces): RecallOutcome => ({
  label: "Sent",
  color: "tastebud",
  why: placeWhy(matched, known),
});

/** Accepted and matched, but only there when an agent asks. */
export const onRequestOutcome = (
  hit: Pick<RecallResult["accepted"][number], "kind" | "kindLabel" | "explanation">,
  catalog: CatalogView | undefined,
  hookLimit: number,
  known: KnownPlaces,
): RecallOutcome => ({
  label: "On request",
  color: "cyan",
  why: hit.explanation.policy === "pull" ? "Given when an agent asks" : `Over the ${hookLimit}-item limit`,
  whyInFull: `${availableThroughRecallReason(hit, catalog, hookLimit)}. ${placeWhy(hit.explanation.matchedPlace, known)}.`,
});

export const rejectionOutcome = (hit: Pick<RecallResult["rejected"][number], "reason">): RecallOutcome => ({
  label: "Rejected",
  color: "red",
  why: hit.reason === undefined ? "Agents are told you said no" : `“${hit.reason}”`,
  whyInFull: `Agents are told you said no, so they don't propose it again${hit.reason === undefined ? "." : `: “${hit.reason}”`}`,
});

const EXCLUSION_CHIPS: Record<RecallExclusionReason, Pick<RecallOutcome, "label" | "color">> = {
  "out-of-scope": { label: "Held back", color: "orange" },
  "never-policy": { label: "Not sent", color: "gray" },
  pending: { label: "Pending", color: "blue" },
  "history-not-requested": { label: "History", color: "gray" },
  "kind-not-selected": { label: "Filtered out", color: "gray" },
  "retired-kind": { label: "Retired kind", color: "gray" },
};

/** A match that doesn't reach agents here; the why is `exclusionReason` as a short phrase. */
export const exclusionOutcome = (
  hit: Pick<ExcludedRecallHit, "kind" | "kindLabel" | "status" | "exclusion" | "effectiveScope">,
  catalog: CatalogView | undefined,
  known: KnownPlaces,
): RecallOutcome => {
  const reason = exclusionReason(hit, catalog, known);
  return { ...EXCLUSION_CHIPS[hit.exclusion], why: capitalize(reason), whyInFull: `Matched the words, but ${reason}` };
};

export const historyOutcome = (hit: Pick<RecallResult["history"][number], "status">): RecallOutcome => ({
  label: hit.status === "superseded" ? "Replaced" : "Retracted",
  color: "gray",
  why: "Shown with history",
});

/** Applies where the agent stands, but these words didn't bring it up. No why: the chip says it, row after row. */
export const UNMATCHED_OUTCOME: RecallOutcome = { label: "Not matched", color: "gray" };
