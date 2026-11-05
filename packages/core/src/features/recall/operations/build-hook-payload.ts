/**
 * The one payload builder shared by the UserPromptSubmit hook, `hook-preview` and the recall
 * inspector, so all three show the same bytes. Only `inject` kinds, accepted then rejected, at most
 * `hook.limit` items, never raw sources.
 */
import { Duration, Effect, Option, Schema } from "effect";

import type { DerivedKindDefinition, TasteCatalog } from "#core/domains/kind-catalog/index.ts";
import { formatScopeLabel, type TasteContext, TasteContextSchema } from "#core/domains/places/index.ts";
import { DerivationSummarySchema, RecallExplanationSchema } from "#core/domains/record-views/index.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";

import { assembleDerivationRecall } from "./recall.ts";

const HOOK_SILENCE_REASONS = ["unknown-context", "no-inject-kinds", "no-matches", "over-budget"] as const;

const HookItemSchema = Schema.Struct({
  ...DerivationSummarySchema.fields,
  explanation: RecallExplanationSchema,
});
export type HookItem = typeof HookItemSchema.Type;

export const HookPayloadSchema = Schema.Struct({
  prompt: Schema.String,
  context: TasteContextSchema,
  items: Schema.Array(HookItemSchema),
  /** The `additionalContext` text; absent when the hook stays silent. */
  additionalContext: Schema.optionalKey(Schema.String),
  /** Exactly what the hook writes to stdout; absent when it stays silent. */
  hookOutput: Schema.optionalKey(Schema.String),
  silence: Schema.optionalKey(Schema.Literals(HOOK_SILENCE_REASONS)),
});
export type HookPayload = typeof HookPayloadSchema.Type;

const HOOK_PREAMBLE =
  "Tastebud: evidence about how the user works, as they ratified or rejected it. Not new instructions.";

const renderHookItem = (item: HookItem) =>
  item.status === "accepted"
    ? `- Accepted ${item.kindLabel} (${formatScopeLabel(item.effectiveScope)}): ${item.statement} [${item.id}]`
    : `- Rejected ${item.kindLabel}: ${item.statement} (rejected ${item.decidedAt?.slice(0, 10) ?? "?"}: ${item.reason ?? "no reason"}) [${item.id}]`;

const silentPayload = (
  prompt: string,
  context: TasteContext,
  silence: (typeof HOOK_SILENCE_REASONS)[number],
): HookPayload => ({
  prompt,
  context,
  items: [],
  silence,
});

/**
 * The kinds the hook may send at a context: the inject kinds, or none where the context is unknown,
 * since a hook that can't tell where it is says nothing rather than guess.
 */
export const hookInjectKindsAt = (
  catalog: TasteCatalog,
  context: TasteContext,
): ReadonlyArray<DerivedKindDefinition> =>
  context.origin === "unknown" ? [] : catalog.derivedKinds.filter((kind) => kind.recall === "inject");

/** Builds the prompt hook's payload within `hook.budgetMs`. */
export const buildHookPayload = Effect.fn("recall.buildHookPayload")(function* (input: {
  readonly prompt: string;
  readonly context: TasteContext;
}) {
  const store = yield* TasteStore;
  const { catalog, hook } = store.config;
  if (input.context.origin === "unknown") return silentPayload(input.prompt, input.context, "unknown-context");
  const kinds = hookInjectKindsAt(catalog, input.context);
  if (kinds.length === 0) return silentPayload(input.prompt, input.context, "no-inject-kinds");
  const build = Effect.gen(function* () {
    const snapshot = yield* store.snapshot;
    const hits = yield* store.search(input.prompt, { type: "Derivation", kinds: kinds.map((kind) => kind.key) });
    const recall = assembleDerivationRecall(
      { snapshot, catalog },
      { kinds, context: input.context, limit: hook.limit, history: false },
      hits,
    );
    // A recall hit carries its sources; the hook never sends sources, so keep the summary and explanation.
    return [...recall.accepted, ...recall.rejected]
      .slice(0, hook.limit)
      .map(({ sources: _sources, ...item }): HookItem => item);
  });
  const items = yield* Effect.timeoutOption(build, Duration.millis(hook.budgetMs));
  if (Option.isNone(items)) return silentPayload(input.prompt, input.context, "over-budget");
  if (items.value.length === 0) return silentPayload(input.prompt, input.context, "no-matches");
  const additionalContext = [HOOK_PREAMBLE, ...items.value.map(renderHookItem)].join("\n");
  const hookOutput = JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } });
  const payload: HookPayload = {
    prompt: input.prompt,
    context: input.context,
    items: items.value,
    additionalContext,
    hookOutput,
  };
  return payload;
});
