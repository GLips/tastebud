import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { TasteContext } from "@tastebud/core/places";
import type { HookPayload, RecallExplainItem } from "@tastebud/core/recall";
/** Recall's outcomes in plain words: why an item was left out, why the hook stayed silent, why it applies. */
import type { ExcludedRecallHit, RecallExclusionReason, RecallResult } from "@tastebud/core/record-views";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { capitalize, findKindView } from "#review/shared/ui/kind-identity.tsx";

/** Why a recall hit is available on request rather than injected by the hook. */
export const availableThroughRecallReason = (
  hit: Pick<RecallResult["accepted"][number], "kind" | "kindLabel" | "status" | "explanation">,
  catalog: CatalogView | undefined,
  hookLimit: number,
): string => {
  if (hit.status === "rejected") return "Rejected: recalled as not accepted";
  if (hit.explanation.policy !== "pull") return `Eligible, below the ${hookLimit}-item limit`;
  const kind = findKindView(catalog, hit.kind);
  return `${capitalize(kind?.singular ?? hit.kindLabel)} policy: when an agent asks`;
};

export const exclusionReason = (
  hit: Pick<ExcludedRecallHit, "kind" | "kindLabel" | "status" | "exclusion">,
  catalog: CatalogView | undefined,
  context: TasteContext,
  known: KnownPlaces,
): string => {
  const kind = findKindView(catalog, hit.kind);
  const here = context.places.map(known.labelOf).join(", ");
  const reasons: Record<RecallExclusionReason, string> = {
    "out-of-scope": context.places.length === 0 ? "Not global, and the context is unknown" : `Outside ${here}`,
    "never-policy": `${capitalize(kind?.singular ?? hit.kindLabel)} policy: backlog only`,
    pending: "Pending review",
    "history-not-requested": `${capitalize(hit.status)}: shown only with history`,
    "kind-not-selected": `${capitalize(kind?.plural ?? hit.kind)} filtered out`,
    "retired-kind": "Retired kind",
  };
  return reasons[hit.exclusion];
};

export const matchedPlaceWording = (matched: string, known: KnownPlaces) =>
  matched === "global" ? "Global: applies everywhere" : `Matched at ${known.labelOf(matched)}`;

export const hookSilenceWording = (hook: HookPayload, catalog: CatalogView | undefined): string | undefined => {
  switch (hook.silence) {
    case "unknown-context":
      return "The context is unknown, so the hook stays silent rather than guess.";
    case "no-inject-kinds":
      return "No kind in this store has the inject policy.";
    case "over-budget":
      return `Timed out: building the payload took longer than ${catalog?.hook.budgetMs ?? 650} ms, so the hook stayed silent.`;
    case "no-matches":
      return "No accepted inject item here matches these words.";
    case "recently-emitted":
      return "Everything it would send was already sent within the last three turns.";
    case "output-budget":
      return "Nothing it would send fits the hook's 4 KiB output budget.";
    case undefined:
      return "";
  }
};

type RecallReachedItem = Exclude<RecallExplainItem, { outcome: "excluded" }>;

const RECALL_SECTION_WORDING: Record<RecallReachedItem["section"], (item: RecallReachedItem) => string> = {
  accepted: () => "Accepted.",
  rejected: () => "Rejected: recalled as not accepted, so agents don't propose it again.",
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
    matched === "global" ? "Global: applies everywhere." : `In scope: matched at ${known.labelOf(matched)}.`,
    item.outcome === "injected"
      ? "The hook may inject it, and recall returns it, when a prompt's words match."
      : "Recall returns it when a prompt's words match; the hook never sends it here.",
    promptOutcomeReason(item.id, forThisPrompt),
  ];
}
