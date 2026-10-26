/** The text `propose`, `revise-scope`, `repoint` and `repoint-preview` print. */
import {
  formatDerivationSummary,
  formatRepeatMatches,
  formatScopeBraces,
  section,
} from "#core/domains/record-text/index.ts";
import type { DerivationView, RepeatMatch } from "#core/domains/record-views/index.ts";

import type { RepointPreviewResult } from "./repoint-preview.ts";
import type { RepointPlaceResult } from "./repoint.ts";

export const renderProposeText = (result: {
  readonly derivation: DerivationView;
  readonly related: ReadonlyArray<RepeatMatch>;
  readonly warnings: ReadonlyArray<string>;
}) =>
  [
    `Proposed ${result.derivation.kindLabel} ${result.derivation.id}`,
    `  ${result.derivation.statement}  ${formatScopeBraces(result.derivation)}${result.derivation.scopeSource === "defaulted" ? " (scope defaulted from your context)" : ""}`,
    "  Pending until the owner decides in the review UI (review-url gives the link).",
    ...result.warnings.map((warning) => `  Warning: ${warning}`),
    ...formatRepeatMatches("Related:", result.related),
  ].join("\n");

export const renderRepointText = (result: RepointPlaceResult) =>
  [
    `Repoint ${result.from} → ${result.to}`,
    section(
      "Proposed revisions (pending until ratified)",
      result.proposals.map(
        (proposal) => `- ${proposal.revision.id} supersedes ${formatDerivationSummary(proposal.supersedes)}`,
      ),
    ),
    ...(result.alreadyPending.length === 0
      ? []
      : [
          section(
            "Already pending",
            result.alreadyPending.map((summary) => `- ${formatDerivationSummary(summary)}`),
          ),
        ]),
    ...(result.blocked.length === 0
      ? []
      : [
          section(
            "Blocked (not proposed)",
            result.blocked.map((entry) => `- ${formatDerivationSummary(entry.derivation)}: ${entry.problem}`),
          ),
        ]),
  ].join("\n");

export const renderRepointPreviewText = (result: RepointPreviewResult) =>
  [
    `Repoint ${result.from} → ${result.to} would propose (nothing written)`,
    section(
      "Revisions",
      result.revisions.map(
        (revision) =>
          `- ${formatDerivationSummary(revision.supersedes)}` +
          (revision.keptPlaces.length === 0 ? "" : `\n    keeps ${revision.keptPlaces.join(", ")}`),
      ),
    ),
    ...(result.alreadyPending.length === 0
      ? []
      : [
          section(
            "Already pending",
            result.alreadyPending.map((summary) => `- ${formatDerivationSummary(summary)}`),
          ),
        ]),
    ...(result.blocked.length === 0
      ? []
      : [
          section(
            "Blocked (would not be proposed)",
            result.blocked.map((entry) => `- ${formatDerivationSummary(entry.derivation)}: ${entry.problem}`),
          ),
        ]),
    ...(result.pendingAtFrom.length === 0
      ? []
      : [
          section(
            `Pending proposals still at ${result.from} (repoint leaves these alone)`,
            result.pendingAtFrom.map((summary) => `- ${formatDerivationSummary(summary)}`),
          ),
        ]),
  ].join("\n");
