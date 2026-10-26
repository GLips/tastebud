/** The text `places` prints. */
import { formatContextLine, formatDerivationSummary, section } from "#core/domains/record-text/index.ts";

import type { AuditPlacesResult } from "./places-audit.ts";

const formatCounts = (counts: AuditPlacesResult["globalCounts"]) =>
  counts.map((count) => `${count.count} ${count.kind} ${count.status}`).join(", ");

export const renderPlacesText = (result: AuditPlacesResult) =>
  [
    formatContextLine(result.context),
    section("Places in use", [
      ...(result.globalCounts.length === 0 ? [] : [`- global · ${formatCounts(result.globalCounts)}`]),
      ...result.places.map((entry) => `- ${entry.place} · ${formatCounts(entry.counts)}`),
    ]),
    section(
      `Unmatched by these probes (${result.audit.probes.map((probe) => probe.probe).join(", ")})`,
      result.audit.unmatched.map(
        (entry) =>
          `- ${entry.place}\n${entry.derivations.map((summary) => `    ${formatDerivationSummary(summary)}`).join("\n")}`,
      ),
    ),
  ].join("\n\n");
