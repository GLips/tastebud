/** Small pieces every text rendering shares. Pure string building. */
import type { SourceRecord } from "../records.ts";
import { formatScopeLabel } from "../shared/places.ts";
import type { DerivationSummary, RepeatMatch, SourceView } from "../view-schemas.ts";

export const day = (iso: string | undefined) => iso?.slice(0, 10) ?? "?";
export const minute = (iso: string) => iso.slice(0, 16).replace("T", " ");

export const indent = (text: string, prefix = "    ") =>
  text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");

export const quoted = (text: string) => `"${text.replace(/\s+/g, " ").trim()}"`;

export const section = (title: string, lines: ReadonlyArray<string>, empty = "(none)") =>
  `${title}\n${lines.length === 0 ? `  ${empty}` : lines.join("\n")}`;

export const formatAttribution = (source: SourceRecord) =>
  [`${source.said_by_label} (${source.said_by})`, minute(source.said_at), source.address].filter(Boolean).join(" · ");

export const formatSourceLine = (view: SourceView) =>
  `${quoted(view.source.quote)}\n  — ${formatAttribution(view.source)}  [${view.kindLabel} ${view.source.id}]`;

/** `{scope}`, with a defaulted proposed scope marked so a reviewer sees nobody chose it. */
export const formatScopeBraces = (summary: DerivationSummary) => `{${formatScopeLabel(summary.effectiveScope)}}`;

/** One line: statement, kind, status with its date and reason, id. */
export const formatDerivationSummary = (summary: DerivationSummary) => {
  const decided = summary.decidedAt === undefined ? "" : ` ${day(summary.decidedAt)}`;
  const reason = summary.reason === undefined ? "" : `: ${summary.reason}`;
  const retired = summary.retired ? ", retired kind" : "";
  return `${quoted(summary.statement)} (${summary.kindLabel}, ${summary.status}${decided}${reason}${retired})  [${summary.id}]`;
};

export const formatRepeatMatches = (title: string, matches: ReadonlyArray<RepeatMatch>) =>
  matches.length === 0
    ? []
    : [
        title,
        ...matches.map(
          (match) =>
            `  - ${quoted(match.statement)}  ${formatScopeBraces(match)}  [${match.id}]\n` +
            `      ${match.status}, similarity ${match.similarity.toFixed(2)}, proposed ${day(match.proposedAt)}` +
            (match.decidedAt === undefined ? "" : `, decided ${day(match.decidedAt)}`) +
            (match.reason === undefined ? "" : `\n      reason: ${match.reason}`),
        ),
      ];
