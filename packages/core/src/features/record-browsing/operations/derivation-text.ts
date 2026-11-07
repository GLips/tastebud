/** Text for one derivation in full, and for `show` of any record. */
import { formatScopeLabel } from "#core/domains/places/index.ts";
import {
  formatAttribution,
  formatDerivationSummary,
  formatSourceLine,
  indent,
  minute,
  quoted,
} from "#core/domains/record-text/index.ts";
import type { DerivationView, ShowResult } from "#core/domains/record-views/index.ts";
import type { ThreadEntryRecord } from "#core/domains/records/index.ts";

const formatThread = (thread: ReadonlyArray<ThreadEntryRecord>) =>
  thread.map((entry) => `  ${entry.author} · ${minute(entry.at)}\n${indent(entry.text)}`);

const block = (title: string, lines: ReadonlyArray<string>) => (lines.length === 0 ? [] : ["", title, ...lines]);

const renderDerivationViewText = (view: DerivationView) => {
  const { derivation } = view;
  const proposedScope = `${formatScopeLabel(view.proposedScope)}${view.scopeSource === "defaulted" ? " (defaulted from the proposer's context)" : ""}`;
  const scopeChanged = JSON.stringify(view.proposedScope) !== JSON.stringify(view.effectiveScope);
  return [
    `${view.kindLabel} ${derivation.id}${view.retired ? " (retired kind)" : ""}`,
    `  ${derivation.statement}`,
    `  status: ${view.status}${view.decidedAt === undefined ? "" : ` (${view.decidedAt.slice(0, 10)})`}${view.reason === undefined ? "" : `, reason: ${view.reason}`}`,
    `  scope: ${proposedScope}`,
    ...(scopeChanged ? [`  effective scope: ${formatScopeLabel(view.effectiveScope)} (set by the owner)`] : []),
    ...(view.subject === undefined ? [] : [`  subject: ${view.subject}`]),
    `  proposed by ${derivation.proposed_by} at ${minute(derivation.proposed_at)}`,
    ...block("Reasoning", derivation.reasoning === "" ? [] : [indent(derivation.reasoning, "  ")]),
    ...block("Despite", [
      ...view.despite.map((other) => `  ${formatDerivationSummary(other)}`),
      ...(derivation.despite_case === undefined ? [] : [indent(derivation.despite_case, "  ")]),
    ]),
    ...block("Cites", [
      ...view.supportingSources.map((source) => indent(formatSourceLine(source), "  ")),
      ...view.supportingDerivations.map((other) => `  ${formatDerivationSummary(other)}`),
    ]),
    ...block("Contradicts", [
      ...view.contradictingSources.map((source) => indent(formatSourceLine(source), "  ")),
      ...view.contradictingDerivations.map((other) => `  ${formatDerivationSummary(other)}`),
    ]),
    ...block("Supersedes", view.supersedes === undefined ? [] : [`  ${formatDerivationSummary(view.supersedes)}`]),
    ...block(
      "Revised by",
      view.revisions.map((other) => `  ${formatDerivationSummary(other)}`),
    ),
    ...block(
      "Decisions",
      view.decisions.map(
        (decision) =>
          `  ${decision.outcome} by ${decision.by}${decision.via === undefined ? "" : ` via ${decision.via}`} at ${minute(decision.at)}` +
          (decision.scope === undefined
            ? ""
            : ` with scope ${decision.scope === "global" ? "global" : (decision.places ?? []).join(", ")}`) +
          (decision.reason === undefined ? "" : `: ${decision.reason}`),
      ),
    ),
    ...block("Thread", formatThread(view.thread)),
  ].join("\n");
};

export const renderShowText = (result: ShowResult) => {
  const { record } = result;
  const reverse = [
    ...block(
      "Cited by",
      result.citedBy.map((other) => `  ${formatDerivationSummary(other)}`),
    ),
    ...block(
      "Revised by",
      result.revisedBy.map((source) => `  ${quoted(source.quote)}  [${source.id}]`),
    ),
    ...block(
      "Re-proposed despite this",
      result.despitedBy.map((other) => `  ${formatDerivationSummary(other)}`),
    ),
    ...block(
      "Acknowledged by",
      result.acknowledgedBy.map((other) => `  ${formatDerivationSummary(other)}`),
    ),
    "",
    `file: ${result.path}`,
  ];
  switch (record.type) {
    case "Derivation":
      return [
        result.derivation === undefined ? record.statement : renderDerivationViewText(result.derivation),
        ...reverse,
      ].join("\n");
    case "Source":
      return [
        `${result.source?.kindLabel ?? record.kind} ${record.id}${result.source?.retired === true ? " (retired kind)" : ""}`,
        indent(record.quote, "  > "),
        `  — ${formatAttribution(record)} (precision: ${record.said_at_precision})`,
        `  captured ${minute(record.captured_at)} via ${record.captured_via}`,
        ...(record.captured_in === undefined ? [] : [`  captured in: ${record.captured_in.join(", ")}`]),
        ...(record.revises === undefined ? [] : [`  revises ${record.revises}`]),
        ...block("Before", record.before === undefined ? [] : [indent(record.before, "  ")]),
        ...block("After", record.after === undefined ? [] : [indent(record.after, "  ")]),
        ...reverse,
      ].join("\n");
    case "Decision":
      return [
        `Decision ${record.id}: ${record.outcome} ${record.target}`,
        `  by ${record.by}${record.via === undefined ? "" : ` via ${record.via}`} at ${minute(record.at)}`,
        ...(record.reason === undefined ? [] : [`  reason: ${record.reason}`]),
        ...(record.scope === undefined
          ? []
          : [`  scope: ${record.scope === "global" ? "global" : (record.places ?? []).join(", ")}`]),
        ...(record.acknowledges === undefined ? [] : [`  acknowledges: ${record.acknowledges.join(", ")}`]),
        ...reverse,
      ].join("\n");
    case "ThreadEntry":
      return [
        `Thread entry ${record.id} on ${record.thread}`,
        `  ${record.author} · ${minute(record.at)}`,
        indent(record.text),
        ...reverse,
      ].join("\n");
  }
};
