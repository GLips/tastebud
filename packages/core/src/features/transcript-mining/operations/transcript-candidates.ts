/**
 * `transcript-candidates`: the owner's own typed words from recent Claude Code sessions, each with a
 * reference `capture` can quote it by. Messages are placed and filtered by project before any text
 * is kept, and every message left out is counted, so an empty result says why.
 */
import { Clock, Effect, Schema } from "effect";

import {
  type EligibleTranscriptMessage,
  type MinedTranscriptMessage,
  mineClaudeCodeTranscriptLines,
  ownerTextSimilarity,
  SIMILAR_OWNER_TEXT_THRESHOLD,
  TranscriptEligibilityReasonSchema,
} from "#core/domains/claude-code-transcript/index.ts";
import { canonicalInputPlaces } from "#core/domains/derivation-scope/index.ts";
import { placeCovers, type PlaceKey } from "#core/domains/places/index.ts";
import { resolvePlacesForDirectory } from "#core/features/place-context/index.server.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import {
  type ClaudeCodeTranscriptFile,
  claudeCodeTranscriptRoot,
  listClaudeCodeTranscripts,
  readClaudeCodeTranscriptFile,
} from "#core/infrastructure/claude-code-transcripts.ts";
import { realHomeDirectory } from "#core/infrastructure/home-directory.ts";
import { OptionalTrimmedText, OptionalTrimmedTextList } from "#core/shared/input-text.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";
import { compareIsoTimes, formatLocalIsoTime } from "#core/shared/iso-times.ts";

import { TranscriptReferenceSchema } from "./read-transcript-message.ts";

const DEFAULT_DAYS = 7;
/** How far back `after` and `similar_to` reach: older sessions are left for Claude Code to clean up. */
export const TRANSCRIPT_LOOKBACK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const TranscriptCandidatesInput = Schema.Struct({
  days: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))).annotate({
    description: `How many days back to read (default ${String(DEFAULT_DAYS)})`,
  }),
  project: OptionalTrimmedTextList.annotate({
    description: "Only messages sent in these places or under them, e.g. github.com/acme/web::",
  }),
  after: OptionalTrimmedText.annotate({
    description: `Only messages sent after this ISO time, e.g. a catch-up's read_through; reaches back at most ${String(TRANSCRIPT_LOOKBACK_DAYS)} days`,
  }),
  before: OptionalTrimmedText.annotate({ description: "Only messages sent at or before this ISO time" }),
  similar_to: OptionalTrimmedText.annotate({
    description: `Only messages that repeat this request, most alike first, over ${String(TRANSCRIPT_LOOKBACK_DAYS)} days unless days or after say otherwise`,
  }),
});
export type TranscriptCandidatesInput = typeof TranscriptCandidatesInput.Type;

const TranscriptCandidateSchema = Schema.Struct({
  reference: TranscriptReferenceSchema,
  said_at: Schema.String,
  cwd: Schema.String,
  places: Schema.Array(Schema.String),
  because: TranscriptEligibilityReasonSchema,
  /** The owner's text with Claude Code's wrappers cut out; a quote must sit inside one part. */
  parts: Schema.Array(Schema.String),
  /** The end of what the agent said just before, which the owner may be answering. */
  replying_to: Schema.optionalKey(Schema.String),
  /** With `similar_to`: how alike, 0 to 1. */
  similarity: Schema.optionalKey(Schema.Number),
});
export type TranscriptCandidate = typeof TranscriptCandidateSchema.Type;

const LeftOutSchema = Schema.Struct({
  status: Schema.Literals(["excluded", "unknown"]),
  problem: Schema.String,
  count: Schema.Int,
});

export const TranscriptCandidatesResultSchema = Schema.Struct({
  transcript_root: Schema.String,
  since: Schema.String,
  projects: Schema.Array(Schema.String),
  sessions: Schema.Int,
  candidates: Schema.Array(TranscriptCandidateSchema),
  /** Messages whose cwd resolved to no place, so they can't be placed or filtered. */
  unresolved: Schema.Int,
  /** Messages placed outside the requested projects. */
  other_projects: Schema.Int,
  /** Messages in the window and the projects that mining's rule left out, counted by status and problem. */
  left_out: Schema.Array(LeftOutSchema),
});
export type TranscriptCandidatesResult = typeof TranscriptCandidatesResultSchema.Type;

interface SessionMessage {
  readonly session: string;
  readonly mined: MinedTranscriptMessage;
}

/**
 * One copy of each message: a resumed or forked session can carry earlier messages under the same
 * uuid, or under a new one with the same time and words.
 */
const distinctMessages = (messages: ReadonlyArray<SessionMessage>) => {
  const seen = new Set<string>();
  return messages.filter(({ mined }) => {
    const keys = [
      ...(mined.uuid === undefined ? [] : [`uuid ${mined.uuid}`]),
      ...(mined.status === "eligible" ? [`said ${mined.timestamp}\n${mined.parts.join("\n")}`] : []),
    ];
    if (keys.some((key) => seen.has(key))) return false;
    for (const key of keys) seen.add(key);
    return true;
  });
};

const parseInputTime = (field: string, value: string | undefined) => {
  if (value === undefined) return Effect.succeed(undefined);
  const ms = Date.parse(value);
  return Number.isNaN(ms)
    ? Effect.fail(new InvalidTasteInput({ problems: [`${field}: expected an ISO time, got ${value}`] }))
    : Effect.succeed(ms);
};

const tallyLeftOut = (messages: ReadonlyArray<MinedTranscriptMessage>) => {
  const counts = new Map<string, { status: "excluded" | "unknown"; problem: string; count: number }>();
  for (const message of messages) {
    if (message.status === "eligible") continue;
    const key = `${message.status}\n${message.problem}`;
    const entry = counts.get(key) ?? { status: message.status, problem: message.problem, count: 0 };
    counts.set(key, { ...entry, count: entry.count + 1 });
  }
  return [...counts.values()].toSorted((left, right) => right.count - left.count);
};

const messagesInWindow = Effect.fn("transcript-mining.messagesInWindow")(function* (
  files: ReadonlyArray<ClaudeCodeTranscriptFile>,
  inWindow: (timestamp: string | undefined) => boolean,
) {
  const messages: Array<SessionMessage> = [];
  for (const file of files)
    for (const mined of mineClaudeCodeTranscriptLines(yield* readClaudeCodeTranscriptFile(file.path)))
      if (inWindow(mined.timestamp)) messages.push({ session: file.session, mined });
  return messages;
});

/** From when to read, and whether a message's time falls in the window; a message without one is judged later. */
const readingWindowOf = Effect.fn("transcript-mining.readingWindowOf")(function* (input: TranscriptCandidatesInput) {
  const now = yield* Clock.currentTimeMillis;
  const afterMs = yield* parseInputTime("after", input.after);
  const beforeMs = yield* parseInputTime("before", input.before);
  const widened = afterMs !== undefined || input.similar_to !== undefined;
  const reachesBack = input.days ?? (widened ? TRANSCRIPT_LOOKBACK_DAYS : DEFAULT_DAYS);
  const sinceMs = Math.max(now - reachesBack * DAY_MS, afterMs === undefined ? -Infinity : afterMs + 1);
  const inWindow = (timestamp: string | undefined) => {
    if (timestamp === undefined) return true;
    const ms = Date.parse(timestamp);
    return ms >= sinceMs && (beforeMs === undefined || ms <= beforeMs);
  };
  return { sinceMs, inWindow };
});

/** A candidate for an eligible message, or undefined when `similar_to` finds it unlike the request. */
const candidateOf = (
  input: TranscriptCandidatesInput,
  session: string,
  mined: EligibleTranscriptMessage,
  places: ReadonlyArray<PlaceKey>,
): TranscriptCandidate | undefined => {
  const similarity =
    input.similar_to === undefined ? undefined : ownerTextSimilarity(input.similar_to, mined.parts.join("\n"));
  if (similarity !== undefined && similarity < SIMILAR_OWNER_TEXT_THRESHOLD) return undefined;
  return {
    reference: { session, message: mined.uuid },
    said_at: formatLocalIsoTime(new Date(mined.timestamp)),
    cwd: mined.cwd,
    places,
    because: mined.because,
    parts: mined.parts,
    ...(mined.replyingTo !== undefined && { replying_to: mined.replyingTo }),
    ...(similarity !== undefined && { similarity: Math.round(similarity * 100) / 100 }),
  };
};

export const listTranscriptCandidates = Effect.fn("transcript-mining.listTranscriptCandidates")(function* (
  input: TranscriptCandidatesInput,
) {
  const { config } = yield* TasteStore;
  const projects = yield* canonicalInputPlaces("project", input.project ?? [], realHomeDirectory());
  const { sinceMs, inWindow } = yield* readingWindowOf(input);
  const files = yield* listClaudeCodeTranscripts(sinceMs);
  const messages = yield* messagesInWindow(files, inWindow);

  const placesByCwd = new Map<string, ReadonlyArray<PlaceKey>>();
  const placesOf = (cwd: string) =>
    Effect.gen(function* () {
      const known = placesByCwd.get(cwd);
      if (known !== undefined) return known;
      const places = yield* resolvePlacesForDirectory(config, cwd).pipe(
        Effect.catchTag("PlaceResolutionFailed", () => Effect.succeed([])),
      );
      placesByCwd.set(cwd, places);
      return places;
    });

  const candidates: Array<TranscriptCandidate> = [];
  const judged: Array<MinedTranscriptMessage> = [];
  let unresolved = 0;
  let otherProjects = 0;
  for (const { session, mined } of distinctMessages(messages)) {
    const places = mined.cwd === undefined ? [] : yield* placesOf(mined.cwd);
    if (places.length === 0) unresolved += 1;
    else if (projects.length > 0 && !projects.some((project) => places.some((place) => placeCovers(project, place))))
      otherProjects += 1;
    else if (mined.status !== "eligible") judged.push(mined);
    else {
      const candidate = candidateOf(input, session, mined, places);
      if (candidate !== undefined) candidates.push(candidate);
    }
  }
  const result: TranscriptCandidatesResult = {
    transcript_root: claudeCodeTranscriptRoot(),
    since: formatLocalIsoTime(new Date(sinceMs)),
    projects,
    sessions: files.length,
    candidates: candidates.toSorted(
      (left, right) => (right.similarity ?? 0) - (left.similarity ?? 0) || compareIsoTimes(left.said_at, right.said_at),
    ),
    unresolved,
    other_projects: otherProjects,
    left_out: tallyLeftOut(judged),
  };
  return result;
});
