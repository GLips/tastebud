/**
 * `propose`: append a pending derivation of a kind, with a scope and the repeat check. Only a human
 * decides it; the proposal itself changes nothing anyone recalls.
 */
import { homedir } from "node:os";

import { Effect, Schema } from "effect";

import { OptionalTrimmedText, OptionalTrimmedTextList, TrimmedText, TrimmedTextList } from "../shared/input-text.ts";
import { type DerivationScope, repoRootPlace, scopePlacesOf, type TasteContext } from "../shared/places.ts";
import { OWNER_SUBJECT, type ScopeSource } from "../shared/vocabulary.ts";
import { canonicalInputPlaces, requireAgentActor, resolveOperationContext, type TasteCaller } from "./caller.ts";
import { BUILT_IN_BELIEF_KIND, type DerivedKindDefinition, requireDerivedKind } from "./catalog.ts";
import type { LoadedTasteConfig } from "./config.ts";
import { InvalidTasteInput, NearRepeat, ScopeRequired } from "./errors.ts";
import { stampNewRecord } from "./ids.ts";
import type { DerivationRecord, SourceRecord } from "./records.ts";
import { SCHEMA_VERSION } from "./records.ts";
import { findRepeatMatches, supersessionLineageOf } from "./repeat-check.ts";
import {
  derivationStateOf,
  resolveDerivationRef,
  resolveEvidenceRef,
  type StoreSnapshot,
  TasteStore,
} from "./store.ts";
import { buildDerivationView, type ViewSource } from "./views.ts";

export const ProposeDerivationInput = Schema.Struct({
  kind: TrimmedText.annotate({ description: "Derived kind, e.g. belief" }),
  statement: TrimmedText.annotate({ description: "One line" }),
  supports: TrimmedTextList.annotate({
    description: "Refs it rests on: at least one source of a kind this kind cites; derivations too",
  }),
  contradicts: OptionalTrimmedTextList.annotate({ description: "Refs that cut against it" }),
  supersedes: OptionalTrimmedText.annotate({ description: "An accepted derivation of the same kind this revises" }),
  despite: OptionalTrimmedTextList.annotate({ description: "Every blocking near repeat, when re-proposing anyway" }),
  despite_case: OptionalTrimmedText.annotate({ description: "What changed since those matches (--why)" }),
  reasoning: OptionalTrimmedText.annotate({ description: "Why the cited words support it" }),
  subject: OptionalTrimmedText.annotate({ description: "owner, or the account whose preference it is" }),
  places: OptionalTrimmedTextList.annotate({ description: "Explicit scope: place keys (--place)" }),
  global: Schema.optionalKey(Schema.Boolean).annotate({ description: "Explicit scope: everywhere" }),
  in: OptionalTrimmedText.annotate({ description: "Propose as if in this directory" }),
  at: OptionalTrimmedTextList.annotate({ description: "Propose as if at these places" }),
});
export type ProposeDerivationInput = typeof ProposeDerivationInput.Type;

/** The scope a proposal gets when it names none: repo roots under git, the context's places otherwise. */
const defaultScopeFromContext = (config: LoadedTasteConfig, context: TasteContext): DerivationScope | undefined => {
  const places = config.resolver.name === "git" ? [...new Set(context.places.map(repoRootPlace))] : [...context.places];
  return places.length === 0 ? undefined : { scope: "places", places };
};

const chosenScope = (scope: DerivationScope, source: ScopeSource) => ({ scope, source });

const chooseProposalScope = Effect.fn("taste.chooseProposalScope")(function* (
  config: LoadedTasteConfig,
  input: ProposeDerivationInput,
  caller: TasteCaller,
) {
  if (input.global === true && input.places !== undefined)
    return yield* new InvalidTasteInput({ problems: ["global and places are mutually exclusive"] });
  if (input.global === true) return chosenScope({ scope: "global" }, "explicit");
  if (input.places !== undefined) {
    const places = yield* canonicalInputPlaces("places", input.places, homedir());
    return chosenScope({ scope: "places", places }, "explicit");
  }
  const context = yield* resolveOperationContext(input, caller);
  const defaulted = defaultScopeFromContext(config, context);
  if (defaulted === undefined) return yield* new ScopeRequired({ context });
  return chosenScope(defaulted, "defaulted");
});

/**
 * Sources cited anywhere must be of a kind this kind lists; derivations of any kind may be cited.
 * At least one listed source must be in `supports`.
 */
const checkEvidence = (
  kind: DerivedKindDefinition,
  supports: ReadonlyArray<SourceRecord | DerivationRecord>,
  contradicts: ReadonlyArray<SourceRecord | DerivationRecord>,
) => {
  const problems: Array<string> = [];
  for (const [field, records] of [
    ["supports", supports],
    ["contradicts", contradicts],
  ] as const) {
    for (const record of records) {
      if (record.type === "Source" && !kind.sources.includes(record.kind))
        problems.push(
          `${field}: ${record.id} is a ${record.kind}; a ${kind.singular} cites ${kind.sources.join(" or ")}`,
        );
    }
  }
  if (!supports.some((record) => record.type === "Source"))
    problems.push(`supports: a ${kind.singular} must cite at least one ${kind.sources.join(" or ")} directly`);
  return problems.length > 0 ? Effect.fail(new InvalidTasteInput({ problems })) : Effect.void;
};

const checkSupersedes = (snapshot: StoreSnapshot, kind: DerivedKindDefinition, target: DerivationRecord) => {
  if (target.kind !== kind.key)
    return Effect.fail(
      new InvalidTasteInput({ problems: [`supersedes: ${target.id} is a ${target.kind}, not a ${kind.key}`] }),
    );
  const status = derivationStateOf(snapshot, target).status;
  return status === "accepted"
    ? Effect.void
    : Effect.fail(
        new InvalidTasteInput({
          problems: [`supersedes: ${target.id} is ${status}; only an accepted ${kind.singular} can be revised`],
        }),
      );
};

/** The speaker warning: an owner belief none of whose cited sources the owner said. */
const speakerWarnings = (
  config: LoadedTasteConfig,
  subject: string | undefined,
  supports: ReadonlyArray<SourceRecord | DerivationRecord>,
): Array<string> => {
  if (subject !== OWNER_SUBJECT) return [];
  const ownerSpoke = supports.some((record) => record.type === "Source" && record.said_by === config.owner);
  return ownerSpoke
    ? []
    : [`None of the cited sources were said by the owner (${config.owner}); is this really the owner's view?`];
};

/** A proposal's resolved parts, as `checkDerivationProposal` sees them. */
export interface DerivationProposalParts {
  readonly statement: string;
  readonly scope: DerivationScope;
  readonly supports: ReadonlyArray<SourceRecord | DerivationRecord>;
  readonly contradicts: ReadonlyArray<SourceRecord | DerivationRecord>;
  readonly supersedes: DerivationRecord | undefined;
  readonly despite: ReadonlyArray<DerivationRecord>;
}

/**
 * The rules every new derivation meets, whoever writes it (`propose`, `repoint`): evidence of the
 * kind's source kinds, an accepted same-kind supersession target, and the repeat check with
 * `despite` naming exactly the blocking matches. Returns the matches for the caller to report.
 */
export const checkDerivationProposal = Effect.fn("taste.checkDerivationProposal")(function* (
  view: ViewSource,
  kind: DerivedKindDefinition,
  parts: DerivationProposalParts,
) {
  yield* checkEvidence(kind, parts.supports, parts.contradicts);
  if (parts.supersedes !== undefined) yield* checkSupersedes(view.snapshot, kind, parts.supersedes);
  const repeat = yield* findRepeatMatches(view, {
    kind: kind.key,
    statement: parts.statement,
    scope: parts.scope,
    excludeIds: supersessionLineageOf(view.snapshot, parts.supersedes?.id),
  });
  const despiteIds = new Set(parts.despite.map((derivation) => derivation.id));
  const unlisted = repeat.blocking.filter((match) => !despiteIds.has(match.id));
  if (unlisted.length > 0) return yield* new NearRepeat({ kind: kind.key, matches: repeat.blocking });
  const blockingIds = new Set(repeat.blocking.map((match) => match.id));
  const strayDespite = parts.despite.filter((derivation) => !blockingIds.has(derivation.id));
  if (strayDespite.length > 0)
    return yield* new InvalidTasteInput({
      problems: strayDespite.map(
        (derivation) => `despite: ${derivation.id} is not a near repeat whose scope overlaps; leave it out`,
      ),
    });
  return repeat;
});

export const proposeDerivation = Effect.fn("taste.proposeDerivation")(function* (
  input: ProposeDerivationInput,
  caller: TasteCaller,
) {
  const store = yield* TasteStore;
  const { config } = store;
  const kind = yield* requireDerivedKind(config.catalog, input.kind);
  const proposedBy = yield* requireAgentActor(caller, "propose");
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog: config.catalog };

  const supports = yield* Effect.forEach(input.supports, (ref) => resolveEvidenceRef(snapshot, ref));
  const contradicts = yield* Effect.forEach(input.contradicts ?? [], (ref) => resolveEvidenceRef(snapshot, ref));
  const supersedes =
    input.supersedes === undefined ? undefined : yield* resolveDerivationRef(snapshot, input.supersedes);
  const despite = yield* Effect.forEach(input.despite ?? [], (ref) => resolveDerivationRef(snapshot, ref));
  if (despite.length > 0 && input.despite_case === undefined)
    return yield* new InvalidTasteInput({ problems: ["despite needs despite_case (--why) with what changed"] });
  if (despite.length === 0 && input.despite_case !== undefined)
    return yield* new InvalidTasteInput({ problems: ["despite_case (--why) only applies together with despite"] });

  const { scope, source: scopeSource } = yield* chooseProposalScope(config, input, caller);
  const repeat = yield* checkDerivationProposal(view, kind, {
    statement: input.statement,
    scope,
    supports,
    contradicts,
    supersedes,
    despite,
  });

  const subject = input.subject ?? (kind.key === BUILT_IN_BELIEF_KIND ? OWNER_SUBJECT : undefined);
  const stamp = yield* stampNewRecord;
  const derivation: DerivationRecord = {
    id: stamp.id,
    type: "Derivation",
    schema_version: SCHEMA_VERSION,
    kind: kind.key,
    statement: input.statement,
    scope: scope.scope,
    ...(scope.scope === "places" && { places: scopePlacesOf(scope) }),
    scope_source: scopeSource,
    ...(subject !== undefined && { subject }),
    supports: supports.map((record) => record.id),
    ...(contradicts.length > 0 && { contradicts: contradicts.map((record) => record.id) }),
    ...(supersedes !== undefined && { supersedes: supersedes.id }),
    ...(despite.length > 0 && { despite: despite.map((record) => record.id) }),
    proposed_by: proposedBy,
    proposed_at: stamp.at,
    reasoning: input.reasoning ?? "",
    ...(input.despite_case !== undefined && { despite_case: input.despite_case }),
  };
  const written = yield* store.write(derivation);
  return {
    derivation: buildDerivationView({ snapshot: yield* store.snapshot, catalog: config.catalog }, derivation),
    path: written.path,
    related: [...repeat.blocking, ...repeat.related],
    warnings: speakerWarnings(config, subject, supports),
  };
});
