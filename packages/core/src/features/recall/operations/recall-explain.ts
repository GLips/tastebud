/**
 * `recall-explain`: why one derivation, named by ref or found by text, would or would not reach an
 * agent here. It applies recall's and the hook's own eligibility rules, so it never disagrees with
 * them; it can't judge text relevance for a prompt it was never given.
 */
import { Effect, Schema } from "effect";

import { selectRecallKinds } from "#core/domains/kind-catalog/index.ts";
import { TasteContextSchema } from "#core/domains/places/index.ts";
import { derivationById, resolveDerivationRef } from "#core/domains/record-snapshot/index.ts";
import {
  DerivationSummarySchema,
  RecallExclusionReasonSchema,
  RecallExplanationSchema,
  summarizeDerivation,
  type ViewSource,
} from "#core/domains/record-views/index.ts";
import type { DerivationRecord } from "#core/domains/records/index.ts";
import type { TasteCaller } from "#core/domains/taste-caller/index.ts";
import { resolveOperationContext } from "#core/features/place-context/index.server.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { OptionalTrimmedText } from "#core/shared/input-text.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

import { hookInjectKindsAt } from "./build-hook-payload.ts";
import {
  classifyRecallEligibility,
  DEFAULT_RECALL_LIMIT,
  type RecallEligibilityRules,
  recallFields,
  scoreOfSearchHit,
} from "./recall.ts";

export const ExplainRecallInput = Schema.Struct({
  ref: OptionalTrimmedText.annotate({ description: "The derivation to explain: an id, short id or unique prefix" }),
  text: OptionalTrimmedText.annotate({ description: "Or words from its statement: explains the closest matches" }),
  ...recallFields,
  history: Schema.optionalKey(Schema.Boolean).annotate({ description: "Explain as recall with history would" }),
});
export type ExplainRecallInput = typeof ExplainRecallInput.Type;

/** Recall returns it here; `injected` when the hook may also send it, for a prompt that matches. */
const RecallReachedItemSchema = Schema.Struct({
  ...DerivationSummarySchema.fields,
  outcome: Schema.Literals(["injected", "recalled"]),
  /** The recall section it lands in. */
  section: Schema.Literals(["accepted", "rejected", "history"]),
  /** `score` is text relevance to `text`, 0 for a ref. */
  explanation: RecallExplanationSchema,
});

/** Recall leaves it out here, for a reason worded as recall's own excluded hits. */
const RecallExcludedItemSchema = Schema.Struct({
  ...DerivationSummarySchema.fields,
  outcome: Schema.Literal("excluded"),
  exclusion: RecallExclusionReasonSchema,
});

const RecallExplainItemSchema = Schema.Union([RecallReachedItemSchema, RecallExcludedItemSchema]);
export type RecallExplainItem = typeof RecallExplainItemSchema.Type;

export const RecallExplainResultSchema = Schema.Struct({
  context: TasteContextSchema,
  /** The derived kinds recall would search. */
  kinds: Schema.Array(Schema.String),
  /** The ref's derivation, or the best text matches first. */
  items: Schema.Array(RecallExplainItemSchema),
});
export type RecallExplainResult = typeof RecallExplainResultSchema.Type;

const explainOne = (
  view: ViewSource,
  rules: { readonly recall: RecallEligibilityRules; readonly hook: RecallEligibilityRules },
  derivation: DerivationRecord,
  score: number,
): RecallExplainItem => {
  const summary = summarizeDerivation(view, derivation);
  const recall = classifyRecallEligibility(view, rules.recall, derivation);
  if (recall.section === "excluded") return { ...summary, outcome: "excluded", exclusion: recall.exclusion };
  const hook = classifyRecallEligibility(view, rules.hook, derivation);
  return {
    ...summary,
    // The hook sends only accepted items; an item it would send is also one recall returns here.
    outcome: hook.section === "accepted" ? "injected" : "recalled",
    section: recall.section,
    explanation: { policy: recall.kind.recall, status: summary.status, matchedPlace: recall.matchedPlace, score },
  };
};

export const explainRecallEligibility = Effect.fn("recall.explainRecallEligibility")(function* (
  input: ExplainRecallInput,
  caller: TasteCaller,
) {
  const { ref, text } = input;
  if ((ref === undefined) === (text === undefined))
    return yield* new InvalidTasteInput({ problems: ["give exactly one of ref or text"] });
  const store = yield* TasteStore;
  const { catalog } = store.config;
  const kinds = yield* selectRecallKinds(catalog, input.kind, ["inject", "pull"]);
  const context = yield* resolveOperationContext(input, caller);
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog };
  const rules = {
    recall: { kinds, context, history: input.history === true },
    hook: { kinds: hookInjectKindsAt(catalog, context), context, history: false },
  };
  const matches =
    ref !== undefined
      ? [{ derivation: yield* resolveDerivationRef(snapshot, ref), score: 0 }]
      : (yield* store.search(text ?? "", { type: "Derivation" })).slice(0, DEFAULT_RECALL_LIMIT).flatMap((hit) => {
          const derivation = derivationById(snapshot, hit.id);
          return derivation === undefined ? [] : [{ derivation, score: scoreOfSearchHit(hit) }];
        });
  const result: RecallExplainResult = {
    context,
    kinds: kinds.map((kind) => kind.key),
    items: matches.map(({ derivation, score }) => explainOne(view, rules, derivation, score)),
  };
  return result;
});
