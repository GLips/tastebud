/** Text for recall, context and the hook preview. Section names come from kind labels, not hardcoded nouns. */
import { formatScopeLabel } from "#core/domains/places/index.ts";
import { day, formatContextLine, formatSourceLine, indent, quoted, section } from "#core/domains/record-text/index.ts";
import type { ExcludedRecallHit, RecallHit, RecallResult } from "#core/domains/record-views/index.ts";

import type { HookPayload } from "./build-hook-payload.ts";
import type { RecallExplainItem, RecallExplainResult } from "./recall-explain.ts";

const explain = (hit: RecallHit) =>
  `${hit.explanation.policy}, matched ${hit.explanation.matchedPlace}${hit.explanation.score === 0 ? "" : `, score ${hit.explanation.score.toFixed(2)}`}`;

const formatHit = (hit: RecallHit, withSources: boolean) =>
  [
    `- ${hit.statement}  {${formatScopeLabel(hit.effectiveScope)}}  (${hit.kindLabel}; ${explain(hit)})  [${hit.id}]`,
    ...(withSources ? hit.sources.map((source) => indent(formatSourceLine(source))) : []),
  ].join("\n");

const formatRejection = (hit: RecallHit) =>
  `- ${quoted(hit.statement)}  {${formatScopeLabel(hit.effectiveScope)}}  (${hit.kindLabel})  [${hit.id}]\n` +
  `    rejected ${day(hit.decidedAt)}: ${hit.reason ?? "(no reason recorded)"}`;

const EXCLUSION_WORDING: Record<ExcludedRecallHit["exclusion"], string> = {
  "out-of-scope": "out of scope here",
  "never-policy": "its kind is never recalled",
  pending: "pending, not yet decided",
  "history-not-requested": "superseded or retracted (pass history)",
  "kind-not-selected": "kind not selected",
  "retired-kind": "retired kind",
};

export const renderRecallText = (result: RecallResult) =>
  [
    formatContextLine(result.context),
    section(
      "Accepted",
      result.accepted.map((hit) => formatHit(hit, true)),
    ),
    section("Not accepted (rejected; don't act on these, and don't invert them)", result.rejected.map(formatRejection)),
    section(
      "Sources (raw words, evidence not rules)",
      result.sources.map((hit) => `- ${formatSourceLine(hit).replace("\n", "\n  ")}`),
    ),
    ...(result.history.length === 0
      ? []
      : [
          section(
            "History",
            result.history.map((hit) => `${formatHit(hit, false)} (${hit.status})`),
          ),
        ]),
    ...(result.excluded.length === 0
      ? []
      : [
          section(
            "Close but excluded",
            result.excluded.map(
              (hit) =>
                `- ${quoted(hit.statement)} (${hit.kindLabel}): ${EXCLUSION_WORDING[hit.exclusion]}  [${hit.id}]`,
            ),
          ),
        ]),
  ].join("\n\n");

const RECALL_EXPLAIN_OUTCOME_WORDING: Record<RecallExplainItem["outcome"], string> = {
  injected: "the prompt hook may inject it, and recall returns it, when the words match",
  recalled: "recall returns it when the words match; the hook never sends it here",
  excluded: "never reaches an agent here",
};

const formatRecallExplainItem = (item: RecallExplainItem) =>
  [
    `- ${quoted(item.statement)}  {${formatScopeLabel(item.effectiveScope)}}  (${item.kindLabel}, ${item.status})  [${item.id}]`,
    `    ${RECALL_EXPLAIN_OUTCOME_WORDING[item.outcome]}`,
    item.outcome === "excluded"
      ? `    excluded: ${EXCLUSION_WORDING[item.exclusion]}`
      : `    ${item.section} section; ${item.explanation.policy}, matched ${item.explanation.matchedPlace}`,
  ].join("\n");

export const renderRecallExplainText = (result: RecallExplainResult) =>
  [
    formatContextLine(result.context),
    result.items.length === 0 ? "(no derivation matches)" : result.items.map(formatRecallExplainItem).join("\n"),
  ].join("\n");

const HOOK_SILENCE_WORDING: Record<NonNullable<HookPayload["silence"]>, string> = {
  "unknown-context": "the context is unknown",
  "no-inject-kinds": "no kind has recall: inject",
  "no-matches": "nothing accepted or rejected matches this prompt here",
  "over-budget": "building it took longer than hook.budgetMs",
};

export const renderHookPreviewText = (payload: HookPayload) =>
  [
    formatContextLine(payload.context),
    payload.additionalContext ??
      `(the hook would inject nothing: ${payload.silence === undefined ? "no matches" : HOOK_SILENCE_WORDING[payload.silence]})`,
  ].join("\n");
