import { UNKNOWN_TASTE_CONTEXT } from "@taste/core/places";
import type { TasteCaller } from "@taste/core/taste-caller";
/**
 * The seed's verbs: capture, propose, decide and thread entries, each through core's operations as
 * the actor who would do it, stamped by the story's clock rather than the machine's.
 */
import { Clock, Effect } from "effect";

import {
  ACME,
  CALL_SWEEP,
  CODING_AGENT,
  DEMO_OWNER,
  HOUR_MS,
  MINUTE_MS,
  REVIEW_GAP_MS,
  SEED_PROCESS,
  SEED_STORY_END_MS,
} from "#cli/domains/acme-demo-story/index.ts";
import { runTasteOperation, type TasteOperationInput } from "#cli/infrastructure/taste-core.ts";

const callerAs = (actor: string): TasteCaller => ({ via: "seed", actor, context: UNKNOWN_TASTE_CONTEXT });

export type CaptureInput = TasteOperationInput<"capture">;
export type ProposeInput = TasteOperationInput<"propose">;

/**
 * The seed's clock: record stamps follow the story rather than the machine. Each record's time is
 * kept in `seedTimeline`, so a proposal lands after its evidence and a decision after its proposal.
 */
let seedNowMs = 0;
const seedTimeline = new Map<string, number>();

/** Starts the story's clock over, for a fresh seed run in the same process. */
export const resetSeedClock = () => {
  seedNowMs = 0;
  seedTimeline.clear();
};

const setSeedNow = (ms: number) => {
  seedNowMs = Math.min(ms, SEED_STORY_END_MS);
};
const latestSeedTimeOf = (refs: ReadonlyArray<string | undefined>) =>
  Math.max(0, ...refs.map((ref) => (ref === undefined ? 0 : (seedTimeline.get(ref) ?? 0))));

/** Runs `effect` with record stamps read from the seed's clock; sleeps and monotonic time stay live. */
export const withSeedClock = Effect.fn("demo-seed.withSeedClock")(function* <A, E, R>(effect: Effect.Effect<A, E, R>) {
  const live = yield* Clock.Clock;
  return yield* Effect.provideService(effect, Clock.Clock, {
    currentTimeMillisUnsafe: () => seedNowMs,
    currentTimeMillis: Effect.sync(() => seedNowMs),
    currentTimeNanosUnsafe: () => BigInt(seedNowMs) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(seedNowMs) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => live.monotonicTimeNanosUnsafe(),
    monotonicTimeNanos: live.monotonicTimeNanos,
    sleep: (duration) => live.sleep(duration),
  });
});

/** Stamps `effect`'s record `gapMs` after the latest of `refs`, and remembers when that record changed. */
const seedStep = <E, R>(refs: ReadonlyArray<string | undefined>, gapMs: number, effect: Effect.Effect<string, E, R>) =>
  Effect.suspend(() => {
    setSeedNow(latestSeedTimeOf(refs) + gapMs);
    return effect.pipe(Effect.tap((id) => Effect.sync(() => seedTimeline.set(id, seedNowMs))));
  });

export const capture = Effect.fn("demo-seed.capture")(function* (actor: string, input: CaptureInput) {
  // Captured a couple of minutes after it was said; a capture with no said_at happens "now".
  if (input.said_at !== undefined) seedNowMs = Date.parse(input.said_at) + 2 * MINUTE_MS;
  const result = yield* runTasteOperation("capture", input, callerAs(actor));
  const id = result.source.source.id;
  seedTimeline.set(id, seedNowMs);
  return id;
});

/** Dana's words in a coding session, captured where they said them. */
export const dana = Effect.fn("demo-seed.dana")(function* (
  place: string,
  saidAt: string,
  quote: string,
  extra: Partial<CaptureInput> = {},
) {
  return yield* capture(CODING_AGENT, {
    kind: "memory",
    said_by: DEMO_OWNER,
    said_by_label: "Dana",
    said_at: saidAt,
    quote,
    at: [place],
    ...extra,
  });
});

/** A line from a recorded call, captured by the Granola sweep into the client's place. */
export const callQuote = Effect.fn("demo-seed.callQuote")(function* (
  speaker: { readonly said_by: string; readonly said_by_label: string },
  address: string,
  saidAt: string,
  quote: string,
  before?: string,
) {
  return yield* capture(CALL_SWEEP, {
    kind: "call-quote",
    ...speaker,
    said_at: saidAt,
    quote,
    address,
    at: [ACME],
    ...(before !== undefined && { before }),
  });
});

export const propose = Effect.fn("demo-seed.propose")(function* (actor: string, input: ProposeInput) {
  return yield* seedStep(
    [...input.supports, ...(input.contradicts ?? []), ...(input.despite ?? []), input.supersedes],
    35 * MINUTE_MS,
    runTasteOperation("propose", input, callerAs(actor)).pipe(Effect.map((result) => result.derivation.id)),
  );
});

export type DecideInput = TasteOperationInput<"decide">;

const decisionStep = (input: DecideInput, gapMs: number) =>
  seedStep([input.ref], gapMs, runTasteOperation("decide", input, callerAs(SEED_PROCESS)).pipe(Effect.as(input.ref)));

export const accept = Effect.fn("demo-seed.accept")(function* (ref: string, amended?: ReadonlyArray<string>) {
  return yield* decisionStep(
    { ref, outcome: "accept", ...(amended !== undefined && { scope: "places", places: amended }) },
    REVIEW_GAP_MS,
  );
});
export const reject = Effect.fn("demo-seed.reject")(function* (ref: string, reason: string) {
  return yield* decisionStep({ ref, outcome: "reject", reason }, REVIEW_GAP_MS);
});
/** A retraction follows the incident that prompted it, days after the accept. */
export const retract = Effect.fn("demo-seed.retract")(function* (ref: string, reason: string) {
  return yield* decisionStep({ ref, outcome: "retract", reason }, 6 * 24 * HOUR_MS);
});

export const danaNote = Effect.fn("demo-seed.danaNote")(function* (ref: string, text: string) {
  return yield* seedStep(
    [ref],
    3 * HOUR_MS,
    runTasteOperation("thread-note", { ref, text }, callerAs(SEED_PROCESS)).pipe(Effect.as(ref)),
  );
});
export const agentReply = Effect.fn("demo-seed.agentReply")(function* (
  ref: string,
  text: string,
  actor: string = CODING_AGENT,
) {
  return yield* seedStep(
    [ref],
    25 * MINUTE_MS,
    runTasteOperation("thread-reply", { ref, text }, callerAs(actor)).pipe(Effect.as(ref)),
  );
});
