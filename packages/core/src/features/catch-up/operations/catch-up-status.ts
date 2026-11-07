/**
 * `catch-up`: what a catch-up has to read and weigh. Each source kind is an origin with its own
 * reading, so one the agent can't reach from here waits without holding the others back. Claude Code
 * sessions are the one origin Tastebud reads itself; their backlog is cut to the evidence budget.
 */
import { Clock, Effect, Schema } from "effect";

import { latestOriginReadings, sourcesDueForKinds } from "#core/domains/catch-up/index.ts";
import type { TasteCaller } from "#core/domains/taste-caller/index.ts";
import { resolveOperationContext } from "#core/features/place-context/index.server.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import {
  listTranscriptCandidates,
  type TranscriptCandidate,
  TRANSCRIPT_LOOKBACK_DAYS,
} from "#core/features/transcript-mining/index.server.ts";
import { OptionalTrimmedText } from "#core/shared/input-text.ts";
import { formatLocalIsoTime } from "#core/shared/iso-times.ts";

/** About one ordinary agent task of reading, and few enough proposals to decide over a coffee. */
const CATCH_UP_EVIDENCE_TOKENS = 60_000;
const CATCH_UP_PROPOSALS = 5;
/** A first catch-up reads this far back; later ones read from where the last stopped. */
const FIRST_CATCH_UP_DAYS = 7;
/**
 * A catch-up reads only messages older than this, so a line Claude Code is still writing (this very
 * session's, say) is read whole by the next one rather than skipped behind the reading.
 */
const SETTLE_MS = 2 * 60 * 1000;
/** Rough tokens per character of English, for budgeting what to read. */
const CHARS_PER_TOKEN = 4;
/** How many due sources each kind lists by id; the count says how many more. */
const DUE_IDS_SHOWN = 40;

export const CatchUpStatusInput = Schema.Struct({
  in: OptionalTrimmedText.annotate({ description: "Where the catch-up runs, for its receipts" }),
});

const SessionBacklogSchema = Schema.Struct({
  /** The owner's messages waiting, all projects. */
  messages: Schema.Int,
  tokens: Schema.Int,
  /** Read from here (exclusive); absent on a first catch-up, which reads `days` back. */
  after: Schema.optionalKey(Schema.String),
  days: Schema.optionalKey(Schema.Int),
  /** Read up to here and record it as read_through: now, or where the budget ran out. */
  read_until: Schema.String,
  /** Messages past the budget, left for the next catch-up. */
  left_for_next: Schema.Int,
  /**
   * Messages sent from a directory that resolves to no place now (a deleted worktree, say). They
   * can't be placed or captured, so the reading passes them.
   */
  unplaced: Schema.Int,
  /** The last reading is older than the look-back, so words between were never read. */
  gap_before: Schema.optionalKey(Schema.String),
});

const OriginStatusSchema = Schema.Struct({
  kind: Schema.String,
  description: Schema.optionalKey(Schema.String),
  /** The last reading: everything said up to here was read. */
  read_through: Schema.optionalKey(Schema.String),
  last_read_at: Schema.optionalKey(Schema.String),
  /** Where that catch-up ran; an origin reached through one checkout's tools is read from there. */
  last_run_in: Schema.Array(Schema.String),
  /** Present for the kind Claude Code sessions are captured as: Tastebud reads those itself. */
  sessions: Schema.optionalKey(SessionBacklogSchema),
});

const KindDueSchema = Schema.Struct({
  kind: Schema.String,
  policy: Schema.String,
  due: Schema.Int,
  due_ids: Schema.Array(Schema.String),
});

export const CatchUpStatusResultSchema = Schema.Struct({
  first: Schema.Boolean,
  now: Schema.String,
  run_in: Schema.Array(Schema.String),
  budget: Schema.Struct({ evidence_tokens: Schema.Int, proposals: Schema.Int }),
  origins: Schema.Array(OriginStatusSchema),
  /** Per derived kind, sources no catch-up has weighed under its current proposal prompt. */
  kinds: Schema.Array(KindDueSchema),
});
export type CatchUpStatusResult = typeof CatchUpStatusResultSchema.Type;

const DAY_MS = 24 * 60 * 60 * 1000;

const candidateTokens = (candidate: TranscriptCandidate) =>
  Math.ceil(
    [...candidate.parts, candidate.replying_to ?? ""].reduce((total, text) => total + text.length, 0) / CHARS_PER_TOKEN,
  );

const sameTime = (left: TranscriptCandidate | undefined, right: TranscriptCandidate | undefined) =>
  left !== undefined && right !== undefined && Date.parse(left.said_at) === Date.parse(right.said_at);

/**
 * How many of the oldest candidates fit the budget. The cut is a time, so messages sent at the same
 * instant stay together: the cut backs off before them, or takes them all when they come first. At
 * least one message is always taken, so a huge one can't stall every catch-up.
 */
const takenWithinBudget = (candidates: ReadonlyArray<TranscriptCandidate>) => {
  let tokens = 0;
  let taken = 0;
  for (const candidate of candidates) {
    const cost = candidateTokens(candidate);
    if (taken > 0 && tokens + cost > CATCH_UP_EVIDENCE_TOKENS) break;
    tokens += cost;
    taken += 1;
  }
  let cut = taken;
  while (cut > 0 && sameTime(candidates[cut - 1], candidates[cut])) cut -= 1;
  if (cut > 0) return cut;
  cut = taken;
  while (sameTime(candidates[cut - 1], candidates[cut])) cut += 1;
  return cut;
};

const sessionBacklog = Effect.fn("catch-up.sessionBacklog")(function* (readThrough: string | undefined, nowMs: number) {
  const settled = formatLocalIsoTime(new Date(nowMs - SETTLE_MS));
  const lookbackStart = nowMs - TRANSCRIPT_LOOKBACK_DAYS * DAY_MS;
  const window =
    readThrough === undefined
      ? { days: FIRST_CATCH_UP_DAYS }
      : { after: Date.parse(readThrough) < lookbackStart ? formatLocalIsoTime(new Date(lookbackStart)) : readThrough };
  const listed = yield* listTranscriptCandidates({ ...window, before: settled });
  const taken = takenWithinBudget(listed.candidates);
  const leftForNext = listed.candidates.length - taken;
  const lastTaken = listed.candidates[taken - 1];
  return {
    messages: listed.candidates.length,
    tokens: listed.candidates.reduce((total, candidate) => total + candidateTokens(candidate), 0),
    ...window,
    read_until: leftForNext > 0 && lastTaken !== undefined ? lastTaken.said_at : settled,
    left_for_next: leftForNext,
    unplaced: listed.unresolved,
    ...(readThrough !== undefined &&
      Date.parse(readThrough) < lookbackStart && { gap_before: formatLocalIsoTime(new Date(lookbackStart)) }),
  };
});

export const readCatchUpStatus = Effect.fn("catch-up.readCatchUpStatus")(function* (
  input: typeof CatchUpStatusInput.Type,
  caller: TasteCaller,
) {
  const store = yield* TasteStore;
  const { catalog } = store.config;
  const snapshot = yield* store.snapshot;
  const nowMs = yield* Clock.currentTimeMillis;
  const readings = latestOriginReadings(snapshot.catchUps);
  const origins = [];
  for (const kind of catalog.sourceKinds) {
    const reading = readings.get(kind.key);
    origins.push({
      kind: kind.key,
      ...(kind.description !== undefined && { description: kind.description }),
      ...(reading !== undefined && { read_through: reading.readThrough, last_read_at: reading.at }),
      last_run_in: reading?.runIn ?? [],
      ...(kind.key === catalog.conversationSourceKind && {
        sessions: yield* sessionBacklog(reading?.readThrough, nowMs),
      }),
    });
  }
  const context = yield* resolveOperationContext(input, caller);
  const result: CatchUpStatusResult = {
    first: snapshot.catchUps.length === 0,
    now: formatLocalIsoTime(new Date(nowMs)),
    run_in: context.places,
    budget: { evidence_tokens: CATCH_UP_EVIDENCE_TOKENS, proposals: CATCH_UP_PROPOSALS },
    origins,
    kinds: sourcesDueForKinds(catalog, snapshot.sources, snapshot.catchUps).map(({ kind, tag, due }) => ({
      kind: kind.key,
      policy: tag,
      due: due.length,
      due_ids: due.slice(0, DUE_IDS_SHOWN).map((source) => source.id),
    })),
  };
  return result;
});
