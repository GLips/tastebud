/** `accept-preview`: what accepting with a scope would settle on, before the owner sends it. */
import { Effect, Schema } from "effect";

import { readScopeOverride, ScopeOverrideFields } from "#core/domains/derivation-scope/index.ts";
import { requireLiveDerivedKind } from "#core/domains/kind-catalog/index.ts";
import type { DerivationScope } from "#core/domains/places/index.ts";
import { resolveDerivationRef } from "#core/domains/record-snapshot/index.ts";
import { summarizeDerivation, type ViewSource } from "#core/domains/record-views/index.ts";
import { type DerivationRecord, proposedScopeOf } from "#core/domains/records/index.ts";
import { findRepeatMatches, supersessionLineageOf } from "#core/domains/repeat-detection/index.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { homeDirectory } from "#core/infrastructure/home-directory.ts";
import { TrimmedText } from "#core/shared/input-text.ts";

export const DecideScopeFields = {
  scope: ScopeOverrideFields.scope.annotate({
    description: "Accept only: accept with this scope instead of the proposed one",
  }),
  places: ScopeOverrideFields.places,
};

export const PreviewAcceptanceInput = Schema.Struct({
  ref: TrimmedText.annotate({ description: "The derivation to preview accepting" }),
  ...DecideScopeFields,
});
export type PreviewAcceptanceInput = typeof PreviewAcceptanceInput.Type;

/**
 * Blocking matches under the scope an accept would settle on, split by whether the proposal's
 * `despite` already answered them. Each unanswered one must be acknowledged before the accept lands.
 */
const blockingMatchesOf = (view: ViewSource, derivation: DerivationRecord, effectiveScope: DerivationScope) => {
  const repeat = findRepeatMatches(view, {
    kind: derivation.kind,
    statement: derivation.statement,
    scope: effectiveScope,
    excludeIds: [derivation.id, ...supersessionLineageOf(view.snapshot, derivation.supersedes)],
  });
  const despite = new Set(derivation.despite ?? []);
  return {
    needsAcknowledgement: repeat.blocking.filter((match) => !despite.has(match.id)),
    answeredByDespite: repeat.blocking.filter((match) => despite.has(match.id)),
  };
};

export const unacknowledgedMatches = (
  view: ViewSource,
  derivation: DerivationRecord,
  effectiveScope: DerivationScope,
) => blockingMatchesOf(view, derivation, effectiveScope).needsAcknowledgement;

/** What the review UI's acceptance preview shows before an accept is sent. */
export const previewDerivationAcceptance = Effect.fn("decisions.previewDerivationAcceptance")(function* (
  input: PreviewAcceptanceInput,
) {
  const store = yield* TasteStore;
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog: store.config.catalog };
  const derivation = yield* resolveDerivationRef(snapshot, input.ref);
  yield* requireLiveDerivedKind(store.config.catalog, derivation);
  const override = yield* readScopeOverride(input, homeDirectory());
  const effectiveScope = override ?? proposedScopeOf(derivation);
  return {
    derivation: summarizeDerivation(view, derivation),
    effectiveScope,
    ...blockingMatchesOf(view, derivation, effectiveScope),
  };
});
