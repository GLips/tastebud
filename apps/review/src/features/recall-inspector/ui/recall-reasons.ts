import { HOOK_OUTPUT_BUDGET_CHARS, HOOK_REPEAT_WINDOW_TURNS } from "@tastebud/core/hook-evidence";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { TasteContext } from "@tastebud/core/places";
import type { HookPayload, RecallExplainItem } from "@tastebud/core/recall";
/** Recall's outcomes in plain words: why an item was left out, why the hook stayed silent, why it applies. */
import type { ExcludedRecallHit, RecallExclusionReason, RecallResult } from "@tastebud/core/record-views";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { capitalize, findKindView } from "#review/shared/ui/kind-identity.tsx";

/** Why an accepted recall hit is there on request rather than sent by the hook. */
export const availableThroughRecallReason = (
  hit: Pick<RecallResult["accepted"][number], "kind" | "kindLabel" | "explanation">,
  catalog: CatalogView | undefined,
  hookLimit: number,
): string => {
  if (hit.explanation.policy !== "pull") return `Not sent: the prompt hook sends at most ${hookLimit}`;
  const kind = findKindView(catalog, hit.kind);
  return `${capitalize(kind?.plural ?? hit.kindLabel)} are only given when an agent asks`;
};

/** A rejection recall reads back, with the owner's reason when there is one. */
export const rejectedHitWording = (hit: Pick<RecallResult["rejected"][number], "reason">): string =>
  `You rejected this; agents are told so${hit.reason === undefined ? "" : `: “${hit.reason}”`}`;

export const exclusionReason = (
  hit: Pick<ExcludedRecallHit, "kind" | "kindLabel" | "status" | "exclusion">,
  catalog: CatalogView | undefined,
  context: TasteContext,
  known: KnownPlaces,
): string => {
  const kind = findKindView(catalog, hit.kind);
  const here = context.places.map(known.labelOf).join(", ");
  const reasons: Record<RecallExclusionReason, string> = {
    "out-of-scope":
      context.places.length === 0
        ? "Scoped to a place, and this is nowhere in particular"
        : `Scoped elsewhere, not to ${here}`,
    "never-policy": `${capitalize(kind?.plural ?? hit.kindLabel)} stay in your backlog, never shown to agents`,
    pending: "Waiting for your decision",
    "history-not-requested": `${capitalize(hit.status)}; shown only when you include replaced and retracted`,
    "kind-not-selected": `${capitalize(kind?.plural ?? hit.kind)} are filtered out above`,
    "retired-kind": "Its kind was removed from this store",
  };
  return reasons[hit.exclusion];
};

export const matchedPlaceWording = (matched: string, known: KnownPlaces) =>
  matched === "global" ? "applies everywhere" : `applies in ${known.labelOf(matched)}`;

export const hookSilenceWording = (hook: HookPayload, catalog: CatalogView | undefined): string | undefined => {
  switch (hook.silence) {
    case "unknown-context":
      return "The context is unknown, so the hook stays silent rather than guess.";
    case "no-inject-kinds":
      return "No kind in this store has the inject policy.";
    case "timed-out":
      return `Timed out: building the payload took longer than ${catalog?.hook.budgetMs ?? 650} ms, so the hook stayed silent.`;
    case "no-matches":
      return "None of what the hook may send here matches these words.";
    case "recently-emitted":
      return `Everything it would send was already sent within the last ${HOOK_REPEAT_WINDOW_TURNS} turns.`;
    case "output-budget":
      return `Nothing it would send fits the hook's ${HOOK_OUTPUT_BUDGET_CHARS}-character output budget.`;
    case undefined:
      return "";
  }
};

type RecallReachedItem = Exclude<RecallExplainItem, { outcome: "excluded" }>;

const RECALL_SECTION_WORDING: Record<RecallReachedItem["section"], (item: RecallReachedItem) => string> = {
  accepted: () => "Accepted.",
  rejected: () => "You rejected this; recall tells agents so they don't propose it again.",
  history: (item) => `${capitalize(item.status)}: recalled because history is on.`,
};

function promptOutcomeReason(
  id: string,
  forThisPrompt: { readonly injected: ReadonlySet<string>; readonly recalled: ReadonlySet<string> },
): string {
  if (forThisPrompt.injected.has(id)) return "For this prompt: the hook injects it.";
  if (forThisPrompt.recalled.has(id)) return "For this prompt: recall returns it.";
  return "For this prompt: its words didn't match closely enough to be a candidate.";
}

/** Core's explanation in words, plus whether this prompt's recall and hook actually brought it up. */
export function recallExplanationLines(
  item: RecallExplainItem,
  catalog: CatalogView | undefined,
  context: TasteContext,
  known: KnownPlaces,
  forThisPrompt: { readonly injected: ReadonlySet<string>; readonly recalled: ReadonlySet<string> },
): ReadonlyArray<string> {
  if (item.outcome === "excluded") return [`Excluded: ${exclusionReason(item, catalog, context, known)}.`];
  const matched = item.explanation.matchedPlace;
  return [
    RECALL_SECTION_WORDING[item.section](item),
    matched === "global" ? "It applies everywhere." : `It applies in ${known.labelOf(matched)}.`,
    item.outcome === "injected"
      ? "The hook may inject it, and recall returns it, when a prompt's words match."
      : "Recall returns it when a prompt's words match; the hook never sends it here.",
    promptOutcomeReason(item.id, forThisPrompt),
  ];
}
