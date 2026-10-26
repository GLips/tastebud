/**
 * Pull recall and `context`. Eligibility is the same everywhere: a derivation of a selected kind
 * whose effective scope is global or covers a context place. Each hit says why it is here, and
 * close matches that were left out say why not.
 */
import { Effect, Schema } from "effect";

import { type DerivedKindDefinition, findDerivedKind, selectRecallKinds } from "#core/domains/kind-catalog/index.ts";
import { matchScopeToContext, type TasteContext } from "#core/domains/places/index.ts";
import { derivationById, derivationStateOf, sourceById } from "#core/domains/record-snapshot/index.ts";
import {
  type ExcludedRecallHit,
  type RecallExclusionReason,
  type RecallHit,
  type RecallResult,
  type SourceHit,
  summarizeDerivation,
  supportingSourcesOf,
  viewSource,
  type ViewSource,
} from "#core/domains/record-views/index.ts";
import type { DerivationRecord } from "#core/domains/records/index.ts";
import type { TasteCaller } from "#core/domains/taste-caller/index.ts";
import { resolveOperationContext } from "#core/features/place-context/index.server.ts";
import { type TasteSearchHit, TasteStore } from "#core/features/record-store/index.server.ts";
import { OptionalTrimmedText, OptionalTrimmedTextList, TrimmedText } from "#core/shared/input-text.ts";

export const DEFAULT_RECALL_LIMIT = 5;

export const recallFields = {
  kind: OptionalTrimmedTextList.annotate({
    description: "Derived kinds to search; default every inject and pull kind",
  }),
  in: OptionalTrimmedText.annotate({ description: "Recall as if in this directory" }),
  at: OptionalTrimmedTextList.annotate({ description: "Recall as if at these places" }),
};

export const RecallDerivationsInput = Schema.Struct({
  query: TrimmedText.annotate({ description: "What you are about to decide, in plain words" }),
  ...recallFields,
  history: Schema.optionalKey(Schema.Boolean).annotate({ description: "Also return superseded and retracted" }),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))).annotate({ description: "Per section" }),
});
export type RecallDerivationsInput = typeof RecallDerivationsInput.Type;

/** bm25 is lower-is-better and unbounded; flipped and rounded so higher reads as better. */
export const scoreOfSearchHit = (hit: TasteSearchHit) => Math.round(-hit.rank * 1000) / 1000;

export const recallHitOf = (
  view: ViewSource,
  derivation: DerivationRecord,
  kind: DerivedKindDefinition,
  matchedPlace: string,
  score: number,
): RecallHit => {
  const summary = summarizeDerivation(view, derivation);
  return {
    ...summary,
    explanation: { policy: kind.recall, status: summary.status, matchedPlace, score },
    sources: supportingSourcesOf(view, derivation),
  };
};

export interface RecallEligibilityRules {
  readonly kinds: ReadonlyArray<DerivedKindDefinition>;
  readonly context: TasteContext;
  readonly history: boolean;
}

export interface RecallAssembly extends RecallEligibilityRules {
  readonly limit: number;
}

/** Where one derivation lands in recall under these rules, or why recall leaves it out. */
export type RecallEligibility =
  | {
      readonly section: "accepted" | "rejected" | "history";
      readonly kind: DerivedKindDefinition;
      readonly matchedPlace: string;
    }
  | { readonly section: "excluded"; readonly exclusion: RecallExclusionReason };

/** Pure: the one eligibility rule behind recall, the hook and `recall-explain`. Text relevance aside. */
export const classifyRecallEligibility = (
  view: ViewSource,
  rules: RecallEligibilityRules,
  derivation: DerivationRecord,
): RecallEligibility => {
  const kind = findDerivedKind(view.catalog, derivation.kind);
  if (kind === undefined) return { section: "excluded", exclusion: "retired-kind" };
  if (!rules.kinds.some((selected) => selected.key === kind.key))
    return { section: "excluded", exclusion: kind.recall === "never" ? "never-policy" : "kind-not-selected" };
  const state = derivationStateOf(view.snapshot, derivation);
  const matchedPlace = matchScopeToContext(state.effectiveScope, rules.context.places);
  if (matchedPlace === undefined) return { section: "excluded", exclusion: "out-of-scope" };
  if (state.status === "accepted" || state.status === "rejected") return { section: state.status, kind, matchedPlace };
  if (state.status === "pending") return { section: "excluded", exclusion: "pending" };
  return rules.history
    ? { section: "history", kind, matchedPlace }
    : { section: "excluded", exclusion: "history-not-requested" };
};

/** Pure: sorts full-text hits (best first) into sections by eligibility and status. */
export const assembleDerivationRecall = (
  view: ViewSource,
  assembly: RecallAssembly,
  hits: ReadonlyArray<TasteSearchHit>,
): Pick<RecallResult, "accepted" | "rejected" | "history" | "excluded"> => {
  const sections: Record<"accepted" | "rejected" | "history", Array<RecallHit>> = {
    accepted: [],
    rejected: [],
    history: [],
  };
  const excluded: Array<ExcludedRecallHit> = [];
  for (const hit of hits) {
    const derivation = derivationById(view.snapshot, hit.id);
    if (derivation === undefined) continue;
    const score = scoreOfSearchHit(hit);
    const eligibility = classifyRecallEligibility(view, assembly, derivation);
    if (eligibility.section === "excluded") {
      if (excluded.length < assembly.limit)
        excluded.push({ ...summarizeDerivation(view, derivation), exclusion: eligibility.exclusion, score });
      continue;
    }
    const section = sections[eligibility.section];
    if (section.length < assembly.limit)
      section.push(recallHitOf(view, derivation, eligibility.kind, eligibility.matchedPlace, score));
  }
  return { ...sections, excluded };
};

/** `recall`: eligible derivations ranked by text, then rejections, then matching sources (store-wide). */
export const recallDerivations = Effect.fn("recall.recallDerivations")(function* (
  input: RecallDerivationsInput,
  caller: TasteCaller,
) {
  const store = yield* TasteStore;
  const { catalog } = store.config;
  const kinds = yield* selectRecallKinds(catalog, input.kind, ["inject", "pull"]);
  const context = yield* resolveOperationContext(input, caller);
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog };
  const limit = input.limit ?? DEFAULT_RECALL_LIMIT;
  const derivationHits = yield* store.search(input.query, { type: "Derivation" });
  const sourceHits = yield* store.search(input.query, {
    type: "Source",
    kinds: catalog.sourceKinds.map((kind) => kind.key),
  });
  const sources = sourceHits.slice(0, limit).flatMap((hit): Array<SourceHit> => {
    const source = sourceById(snapshot, hit.id);
    return source === undefined ? [] : [{ ...viewSource(view, source), score: scoreOfSearchHit(hit) }];
  });
  const result: RecallResult = {
    query: input.query,
    context,
    kinds: kinds.map((kind) => kind.key),
    ...assembleDerivationRecall(view, { kinds, context, limit, history: input.history === true }, derivationHits),
    sources,
  };
  return result;
});
