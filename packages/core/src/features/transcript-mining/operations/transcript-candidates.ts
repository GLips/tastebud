/**
 * `transcript-candidates`: the owner's own typed words from recent Claude Code sessions, each with a
 * reference `capture` can quote it by. Messages are placed and filtered by project before any text
 * is kept, and every message left out is counted, so an empty result says why.
 */
import { Clock, Effect, Schema } from "effect";

import {
  type MinedTranscriptMessage,
  mineClaudeCodeTranscriptLines,
  TranscriptEligibilityReasonSchema,
} from "#core/domains/claude-code-transcript/index.ts";
import { canonicalInputPlaces } from "#core/domains/derivation-scope/index.ts";
import { placeCovers, type PlaceKey } from "#core/domains/places/index.ts";
import { resolvePlacesForDirectory } from "#core/features/place-context/index.server.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import {
  claudeCodeTranscriptRoot,
  listClaudeCodeTranscripts,
  readClaudeCodeTranscriptFile,
} from "#core/infrastructure/claude-code-transcripts.ts";
import { realHomeDirectory } from "#core/infrastructure/home-directory.ts";
import { OptionalTrimmedTextList } from "#core/shared/input-text.ts";
import { compareIsoTimes, formatLocalIsoTime } from "#core/shared/iso-times.ts";

import { TranscriptReferenceSchema } from "./read-transcript-message.ts";

const DEFAULT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const TranscriptCandidatesInput = Schema.Struct({
  days: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))).annotate({
    description: `How many days back to read (default ${String(DEFAULT_DAYS)})`,
  }),
  project: OptionalTrimmedTextList.annotate({
    description: "Only messages sent in these places or under them, e.g. github.com/acme/web::",
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
  /** Messages in the window and the projects that mining's rule left out, by status. */
  excluded: Schema.Int,
  unknown: Schema.Int,
  /** Messages whose cwd resolved to no place, so they can't be placed or filtered. */
  unresolved: Schema.Int,
  /** Messages placed outside the requested projects. */
  other_projects: Schema.Int,
  left_out: Schema.Array(LeftOutSchema),
});
export type TranscriptCandidatesResult = typeof TranscriptCandidatesResultSchema.Type;

interface SessionMessage {
  readonly session: string;
  readonly mined: MinedTranscriptMessage;
}

/** One copy of each message: a resumed or forked session can carry earlier messages under the same uuid. */
const distinctMessages = (messages: ReadonlyArray<SessionMessage>) => {
  const seen = new Set<string>();
  return messages.filter(({ mined }) => {
    if (mined.uuid === undefined) return true;
    if (seen.has(mined.uuid)) return false;
    seen.add(mined.uuid);
    return true;
  });
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

export const listTranscriptCandidates = Effect.fn("transcript-mining.listTranscriptCandidates")(function* (
  input: TranscriptCandidatesInput,
) {
  const { config } = yield* TasteStore;
  const projects = yield* canonicalInputPlaces("project", input.project ?? [], realHomeDirectory());
  const sinceMs = (yield* Clock.currentTimeMillis) - (input.days ?? DEFAULT_DAYS) * DAY_MS;
  const files = yield* listClaudeCodeTranscripts(sinceMs);
  const messages: Array<SessionMessage> = [];
  for (const file of files)
    for (const mined of mineClaudeCodeTranscriptLines(yield* readClaudeCodeTranscriptFile(file.path)))
      if (mined.timestamp === undefined || Date.parse(mined.timestamp) >= sinceMs)
        messages.push({ session: file.session, mined });

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
    else
      candidates.push({
        reference: { session, message: mined.uuid },
        said_at: formatLocalIsoTime(new Date(mined.timestamp)),
        cwd: mined.cwd,
        places,
        because: mined.because,
        parts: mined.parts,
      });
  }
  const result: TranscriptCandidatesResult = {
    transcript_root: claudeCodeTranscriptRoot(),
    since: formatLocalIsoTime(new Date(sinceMs)),
    projects,
    sessions: files.length,
    candidates: candidates.toSorted((left, right) => compareIsoTimes(left.said_at, right.said_at)),
    excluded: judged.filter((message) => message.status === "excluded").length,
    unknown: judged.filter((message) => message.status === "unknown").length,
    unresolved,
    other_projects: otherProjects,
    left_out: tallyLeftOut(judged),
  };
  return result;
});
