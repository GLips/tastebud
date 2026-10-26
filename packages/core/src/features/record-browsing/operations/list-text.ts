/** The text `list` prints. */
import { formatDerivationSummary, formatScopeBraces, quoted, section } from "#core/domains/record-text/index.ts";

import type { ListRecordsResult } from "./list-records.ts";

export const renderListText = (result: ListRecordsResult) =>
  [
    section(
      "Derivations",
      result.derivations.map(
        (row) =>
          `- ${formatDerivationSummary(row)}  ${formatScopeBraces(row)}` +
          (row.replacedBy === undefined ? "" : `\n    replaced by ${row.replacedBy.id}`) +
          (row.threadCount === 0 ? "" : `\n    ${row.threadCount} thread entries`),
      ),
    ),
    ...(result.sources.length === 0
      ? []
      : [
          section(
            "Sources",
            result.sources.map(
              (view) =>
                `- ${quoted(view.source.quote)} (${view.kindLabel}, ${view.source.said_by_label})  [${view.source.id}]`,
            ),
          ),
        ]),
  ].join("\n\n");
