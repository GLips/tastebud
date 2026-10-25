/**
 * Pull recall and `context`. Eligibility is the same everywhere: a derivation of a selected kind
 * whose effective scope is global or covers a context place. Each hit says why it is here, and
 * close matches that were left out say why not.
 */
import { Effect, Schema } from "effect";

import { OptionalTrimmedText, OptionalTrimmedTextList, TrimmedText } from "../shared/input-text.ts";
import { matchScopeToContext, type TasteContext } from "../shared/places.ts";
import { resolveOperationContext, type TasteCaller } from "./caller.ts";
import { type DerivedKindDefinition, findDerivedKind, selectRecallKinds } from "./catalog.ts";
import { compareIsoTimes } from "./ids.ts";
import type { SearchHit } from "./index-db.ts";
import type { DerivationRecord } from "./records.ts";
import { derivationById, derivationStateOf, sourceById, TasteStore } from "./store.ts";
import type { ExcludedRecallHit, RecallExclusionReason, RecallHit, RecallResult, SourceHit } from "./view-schemas.ts";
import { summarizeDerivation, supportingSourcesOf, viewSource, type ViewSource } from "./views.ts";

const DEFAULT_RECALL_LIMIT = 5;

const recallFields = {
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

export const ListContextDerivationsInput = Schema.Struct(recallFields);
export type ListContextDerivationsInput = typeof ListContextDerivationsInput.Type;

/** bm25 is lower-is-better and unbounded; flipped and rounded so higher reads as better. */
const scoreOf = (hit: SearchHit) => Math.round(-hit.rank * 1000) / 1000;

const recallHitOf = (
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

export interface RecallAssembly {
  readonly kinds: ReadonlyArray<DerivedKindDefinition>;
  readonly context: TasteContext;
  readonly limit: number;
  readonly history: boolean;
}

/** Pure: sorts full-text hits (best first) into sections by eligibility and status. */
export const assembleDerivationRecall = (
  view: ViewSource,
  assembly: RecallAssembly,
  hits: ReadonlyArray<SearchHit>,
): Pick<RecallResult, "accepted" | "rejected" | "history" | "excluded"> => {
  const selected = new Set(assembly.kinds.map((kind) => kind.key));
  const accepted: Array<RecallHit> = [];
  const rejected: Array<RecallHit> = [];
  const history: Array<RecallHit> = [];
  const excluded: Array<ExcludedRecallHit> = [];
  const exclude = (derivation: DerivationRecord, exclusion: RecallExclusionReason, score: number) => {
    if (excluded.length < assembly.limit) excluded.push({ ...summarizeDerivation(view, derivation), exclusion, score });
  };
  for (const hit of hits) {
    const derivation = derivationById(view.snapshot, hit.id);
    if (derivation === undefined) continue;
    const score = scoreOf(hit);
    const kind = findDerivedKind(view.catalog, derivation.kind);
    if (kind === undefined) {
      exclude(derivation, "retired-kind", score);
      continue;
    }
    if (!selected.has(kind.key)) {
      exclude(derivation, kind.recall === "never" ? "never-policy" : "kind-not-selected", score);
      continue;
    }
    const state = derivationStateOf(view.snapshot, derivation);
    const matchedPlace = matchScopeToContext(state.effectiveScope, assembly.context.places);
    if (matchedPlace === undefined) {
      exclude(derivation, "out-of-scope", score);
      continue;
    }
    const section =
      state.status === "accepted"
        ? accepted
        : state.status === "rejected"
          ? rejected
          : state.status === "pending" || !assembly.history
            ? undefined
            : history;
    if (section === undefined)
      exclude(derivation, state.status === "pending" ? "pending" : "history-not-requested", score);
    else if (section.length < assembly.limit) section.push(recallHitOf(view, derivation, kind, matchedPlace, score));
  }
  return { accepted, rejected, history, excluded };
};

/** `recall`: eligible derivations ranked by text, then rejections, then matching sources (store-wide). */
export const recallDerivations = Effect.fn("taste.recallDerivations")(function* (
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
    return source === undefined ? [] : [{ ...viewSource(view, source), score: scoreOf(hit) }];
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

/** `context`: every accepted, eligible derivation of the selected kinds (default: inject), oldest first. */
export const listContextDerivations = Effect.fn("taste.listContextDerivations")(function* (
  input: ListContextDerivationsInput,
  caller: TasteCaller,
) {
  const store = yield* TasteStore;
  const { catalog } = store.config;
  const kinds = yield* selectRecallKinds(catalog, input.kind, ["inject"]);
  const context = yield* resolveOperationContext(input, caller);
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog };
  const derivations = kinds.flatMap((kind) =>
    snapshot.derivations.flatMap((derivation) => {
      if (derivation.kind !== kind.key) return [];
      const state = derivationStateOf(snapshot, derivation);
      const matchedPlace = matchScopeToContext(state.effectiveScope, context.places);
      return state.status === "accepted" && matchedPlace !== undefined
        ? [recallHitOf(view, derivation, kind, matchedPlace, 0)]
        : [];
    }),
  );
  return {
    context,
    kinds: kinds.map((kind) => kind.key),
    derivations: derivations.sort(
      (left, right) => compareIsoTimes(left.proposedAt, right.proposedAt) || left.id.localeCompare(right.id),
    ),
  };
});
