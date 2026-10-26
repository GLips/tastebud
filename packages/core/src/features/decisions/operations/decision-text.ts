/** The text `decide` and `accept-preview` print. */
import { formatScopeLabel } from "#core/domains/places/index.ts";
import { formatDerivationSummary, formatRepeatMatches } from "#core/domains/record-text/index.ts";
import type { DerivationSummary, DerivationView, RepeatMatch } from "#core/domains/record-views/index.ts";
import type { DecisionRecord } from "#core/domains/records/index.ts";

export const renderDecideText = (result: { readonly decision: DecisionRecord; readonly derivation: DerivationView }) =>
  `${result.decision.outcome} ${result.derivation.kindLabel} ${result.derivation.id}: now ${result.derivation.status}, scope ${formatScopeLabel(result.derivation.effectiveScope)}`;

export const renderAcceptancePreviewText = (result: {
  readonly derivation: DerivationSummary;
  readonly effectiveScope: DerivationSummary["effectiveScope"];
  readonly needsAcknowledgement: ReadonlyArray<RepeatMatch>;
}) =>
  [
    `Accepting ${formatDerivationSummary(result.derivation)}`,
    `  with scope ${formatScopeLabel(result.effectiveScope)}`,
    ...(result.needsAcknowledgement.length === 0
      ? ["  No near repeats to acknowledge."]
      : formatRepeatMatches("Acknowledge these near repeats first:", result.needsAcknowledgement)),
  ].join("\n");
