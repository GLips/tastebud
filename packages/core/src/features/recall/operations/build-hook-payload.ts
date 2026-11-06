/**
 * The one payload builder shared by the UserPromptSubmit hook, `hook-preview` and the recall
 * inspector, so all three show the same bytes. Only accepted derivations of `inject` kinds, at most
 * `hook.limit` items, never raw sources. The prompt and the turn before it are searched apart.
 */
import { dirname, isAbsolute, resolve } from "node:path";

import { Duration, Effect, Option, Schema } from "effect";

import {
  type HookCandidate,
  type HookExcludedCandidate,
  HookExclusionSchema,
  HookMatchedBySchema,
  mergeHookCandidates,
  previousTurnSearchText,
  selectHookItems,
  type TouchedPath,
  type TranscriptReading,
} from "#core/domains/hook-evidence/index.ts";
import type { DerivedKindDefinition, TasteCatalog } from "#core/domains/kind-catalog/index.ts";
import type { TasteContext } from "#core/domains/places/index.ts";
import { TasteContextSchema } from "#core/domains/places/index.ts";
import { DerivationSummarySchema, RecallExplanationSchema } from "#core/domains/record-views/index.ts";
import { resolvePlacesForDirectory } from "#core/features/place-context/index.server.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";

import { assembleDerivationRecall } from "./recall.ts";

const HOOK_SILENCE_REASONS = [
  "unknown-context",
  "no-inject-kinds",
  "no-matches",
  ...HookExclusionSchema.literals,
  "timed-out",
] as const;

/** At most this many directories of touched files are resolved, so a wide turn can't eat the budget. */
const TOUCHED_DIRECTORY_LIMIT = 4;

const HookItemSchema = Schema.Struct({
  ...DerivationSummarySchema.fields,
  explanation: RecallExplanationSchema,
  matchedBy: HookMatchedBySchema,
  /** Status and scope as sent; the transcript marker carries it so a change is sent again. */
  fingerprint: Schema.String,
});
export type HookItem = typeof HookItemSchema.Type;

const HookExcludedItemSchema = Schema.Struct({
  ...HookItemSchema.fields,
  exclusion: HookExclusionSchema,
});

export const HookPayloadSchema = Schema.Struct({
  prompt: Schema.String,
  /** Where the session is, widened by the places of files the previous turn touched. */
  context: TasteContextSchema,
  /** The places touched files added to the context. */
  touchedPlaces: Schema.Array(Schema.String),
  /** Whether the previous turn was searched; `transcript-unavailable` means prompt only. */
  previousTurn: Schema.Literals(["used", "none", "transcript-unavailable"]),
  items: Schema.Array(HookItemSchema),
  /** Selected but not sent: already sent recently, or past the output budget. */
  excluded: Schema.Array(HookExcludedItemSchema),
  /** The `additionalContext` text; absent when the hook stays silent. */
  additionalContext: Schema.optionalKey(Schema.String),
  /** Exactly what the hook writes to stdout; absent when it stays silent. */
  hookOutput: Schema.optionalKey(Schema.String),
  silence: Schema.optionalKey(Schema.Literals(HOOK_SILENCE_REASONS)),
});
export type HookPayload = typeof HookPayloadSchema.Type;

/**
 * The kinds the hook may send at a context: the inject kinds, or none where the context is unknown,
 * since a hook that can't tell where it is says nothing rather than guess.
 */
export const hookInjectKindsAt = (
  catalog: TasteCatalog,
  context: TasteContext,
): ReadonlyArray<DerivedKindDefinition> =>
  context.origin === "unknown" ? [] : catalog.derivedKinds.filter((kind) => kind.recall === "inject");

export interface HookPayloadInput {
  readonly prompt: string;
  readonly context: TasteContext;
  /** The host transcript as read; absent when the caller has none. */
  readonly transcript?: TranscriptReading | undefined;
}

const previousTurnUseOf = (transcript: TranscriptReading | undefined): HookPayload["previousTurn"] => {
  if (transcript?.status === "unavailable") return "transcript-unavailable";
  return transcript?.previousTurn === undefined ? "none" : "used";
};

/**
 * Places of the directories holding touched files, modified first. Only paths the agent's tools
 * named arrive here; a path it merely wrote in prose never widens scope. A directory that is gone
 * or won't resolve adds nothing.
 */
const placesOfTouchedFiles = Effect.fn("recall.placesOfTouchedFiles")(function* (
  touched: ReadonlyArray<TouchedPath>,
  context: TasteContext,
) {
  const { config } = yield* TasteStore;
  const base = context.cwd;
  // A relative path needs the session's cwd to mean anything.
  const directories = [
    ...new Set(
      touched.flatMap(({ path }) => {
        if (isAbsolute(path)) return [dirname(path)];
        return base === undefined ? [] : [dirname(resolve(base, path))];
      }),
    ),
  ].slice(0, TOUCHED_DIRECTORY_LIMIT);
  const resolved = yield* Effect.forEach(
    directories,
    (directory) =>
      resolvePlacesForDirectory(config, directory).pipe(
        Effect.catchTag("PlaceResolutionFailed", () => Effect.succeed([])),
      ),
    { concurrency: "unbounded" },
  );
  return [...new Set(resolved.flat())].filter((place) => !context.places.includes(place));
});

const silentPayload = (
  base: Pick<HookPayload, "prompt" | "context" | "touchedPlaces" | "previousTurn">,
  silence: (typeof HOOK_SILENCE_REASONS)[number],
  excluded: HookPayload["excluded"] = [],
): HookPayload => ({ ...base, items: [], excluded, silence });

const hookItemOf = (candidate: HookCandidate): HookItem => ({
  ...candidate.hit,
  matchedBy: candidate.matchedBy,
  fingerprint: candidate.fingerprint,
});

const excludedItemOf = ({ exclusion, ...candidate }: HookExcludedCandidate): HookPayload["excluded"][number] => ({
  ...hookItemOf(candidate),
  exclusion,
});

/** Builds the prompt hook's payload within `hook.budgetMs`. */
export const buildHookPayload = Effect.fn("recall.buildHookPayload")(function* (input: HookPayloadInput) {
  const store = yield* TasteStore;
  const { catalog, hook } = store.config;
  const previousTurn = input.transcript?.status === "read" ? input.transcript.previousTurn : undefined;
  const base = {
    prompt: input.prompt,
    context: input.context,
    touchedPlaces: [],
    previousTurn: previousTurnUseOf(input.transcript),
  };
  if (input.context.origin === "unknown") return silentPayload(base, "unknown-context");
  const kinds = hookInjectKindsAt(catalog, input.context);
  if (kinds.length === 0) return silentPayload(base, "no-inject-kinds");
  const build = Effect.gen(function* () {
    const touchedPlaces = yield* placesOfTouchedFiles(previousTurn?.touchedPaths ?? [], input.context);
    const context: TasteContext = { ...input.context, places: [...input.context.places, ...touchedPlaces] };
    const snapshot = yield* store.snapshot;
    const acceptedFor = (text: string) =>
      Effect.map(
        store.search(text, { type: "Derivation", kinds: kinds.map((kind) => kind.key) }),
        (hits) =>
          assembleDerivationRecall({ snapshot, catalog }, { kinds, context, limit: hook.limit, history: false }, hits)
            .accepted,
      );
    const promptHits = yield* acceptedFor(input.prompt);
    const previousTurnHits = previousTurn === undefined ? [] : yield* acceptedFor(previousTurnSearchText(previousTurn));
    return { context, touchedPlaces, candidates: mergeHookCandidates(promptHits, previousTurnHits, hook.limit) };
  });
  const built = yield* Effect.timeoutOption(build, Duration.millis(hook.budgetMs));
  if (Option.isNone(built)) return silentPayload(base, "timed-out");
  const widened = { ...base, context: built.value.context, touchedPlaces: built.value.touchedPlaces };
  if (built.value.candidates.length === 0) return silentPayload(widened, "no-matches");
  const earlierEmissions = input.transcript?.status === "read" ? input.transcript.earlierEmissions : [];
  const selection = selectHookItems(built.value.candidates, earlierEmissions);
  const excluded = selection.excluded.map(excludedItemOf);
  if (selection.additionalContext === undefined)
    return silentPayload(
      widened,
      excluded.every((item) => item.exclusion === "recently-emitted") ? "recently-emitted" : "output-budget",
      excluded,
    );
  const { additionalContext, ownerNotice } = selection;
  // additionalContext reaches only the model; systemMessage is the owner's view of the same lines.
  const hookOutput = JSON.stringify({
    systemMessage: ownerNotice,
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext },
  });
  const payload: HookPayload = {
    ...widened,
    items: selection.sent.map(hookItemOf),
    excluded,
    additionalContext,
    hookOutput,
  };
  return payload;
});
