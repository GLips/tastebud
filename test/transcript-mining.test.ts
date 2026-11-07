/**
 * Mining Claude Code transcripts: `tastebud transcript-candidates` and `tastebud capture` by transcript
 * reference, run as processes against transcripts under a scratch CLAUDE_CONFIG_DIR.
 */
import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { Schema } from "effect";

import {
  assistantSays,
  midTurnMessage,
  ownerTurn,
  queuedTurn,
  sentFrom,
  slashCommand,
  taskNotification,
  toolCall,
  writeSessionTranscript,
} from "./claude-code-transcript.ts";
import {
  makeGitRepo,
  makeTemporaryDirectory,
  makeTestStore,
  OWNER,
  runTastebud,
  tastebudProcessEnv,
} from "./support.ts";

const CandidatesJson = Schema.fromJsonString(
  Schema.Struct({
    candidates: Schema.Array(
      Schema.Struct({
        reference: Schema.Struct({ session: Schema.String, message: Schema.String }),
        places: Schema.Array(Schema.String),
        parts: Schema.Array(Schema.String),
      }),
    ),
    left_out: Schema.Array(Schema.Struct({ status: Schema.String, count: Schema.Int })),
    unresolved: Schema.Int,
    other_projects: Schema.Int,
  }),
);
const CaptureJson = Schema.fromJsonString(
  Schema.Struct({
    source: Schema.Struct({
      source: Schema.Struct({
        id: Schema.String,
        said_by: Schema.String,
        said_at: Schema.String,
        address: Schema.String,
        captured_in: Schema.Array(Schema.String),
      }),
    }),
    already_captured: Schema.Boolean,
  }),
);
const FailureJson = Schema.fromJsonString(Schema.Struct({ error: Schema.Struct({ tag: Schema.String }) }));

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const mining = async () => {
  const store = await makeTestStore();
  const configDir = makeTemporaryDirectory("claude-config");
  const web = makeGitRepo("git@github.com:acme/web.git");
  const run = (args: ReadonlyArray<string>) =>
    runTastebud(store, web, args, tastebudProcessEnv({ CLAUDE_CONFIG_DIR: configDir }));
  const candidates = async (args: ReadonlyArray<string> = []) => {
    const result = await run(["transcript-candidates", "--json", ...args]);
    expect(result.exitCode).toBe(0);
    return Schema.decodeUnknownSync(CandidatesJson)(result.stdout);
  };
  return { configDir, web, run, candidates };
};

test("transcript-candidates keeps only what the owner typed, without Claude Code's wrappers", async () => {
  const { configDir, web, candidates } = await mining();
  const typed = ownerTurn(
    'Keep the reducers pure.\n<pasted_content id="1">\nlog output\n</pasted_content>\nAnd no default exports.\n<system-reminder>\nharness text\n</system-reminder>',
  );
  writeSessionTranscript(
    configDir,
    "-acme-web",
    "11111111-aaaa-4aaa-8aaa-111111111111",
    sentFrom(web, minutesAgo(30), [
      typed,
      assistantSays("Noted."),
      toolCall("Read", { file_path: join(web, "a.ts") }, "contents"),
      queuedTurn("Also sort the imports."),
      midTurnMessage("Use tabs in the fixtures."),
      midTurnMessage("Task 4 finished", "task-notification"),
      slashCommand("review", "focus on the reducers", "A skill body the owner never typed."),
      slashCommand("compact", "", "Another skill body."),
      ownerTurn("Run the release from CI.", "sdk"),
      { ...ownerTurn("A subagent's prompt."), isSidechain: true },
      { ...ownerTurn("Missing its source."), promptSource: undefined },
      ownerTurn('<voice_request id="v1">\nSaid aloud.\n</voice_request>'),
      taskNotification("Background build done."),
    ]),
  );

  const result = await candidates();

  // Typed, queued, mid-turn and a slash command's arguments each count.
  expect(result.candidates.map((candidate) => candidate.parts)).toEqual([
    ["Keep the reducers pure.", "And no default exports."],
    ["Also sort the imports."],
    ["Use tabs in the fixtures."],
    ["focus on the reducers"],
  ]);
  expect(result.candidates[0]?.places).toEqual(["github.com/acme/web::"]);
  // Task notification (attachment and record), two skill bodies, an empty slash command, sdk, sidechain.
  const leftOut = (status: string) =>
    result.left_out.reduce((total, entry) => (entry.status === status ? total + entry.count : total), 0);
  expect([leftOut("excluded"), leftOut("unknown")]).toEqual([7, 2]);
});

test("transcript-candidates filters by project and window before any text, counting what it can't place", async () => {
  const { configDir, web, candidates } = await mining();
  const api = makeGitRepo("git@github.com:acme/api.git");
  writeSessionTranscript(configDir, "-acme-web", "22222222-aaaa-4aaa-8aaa-222222222222", [
    ...sentFrom(web, minutesAgo(10), [ownerTurn("Web words.")]),
    ...sentFrom(web, minutesAgo(60 * 24 * 30), [ownerTurn("Words from last month.")]),
  ]);
  writeSessionTranscript(configDir, "-acme-api", "33333333-aaaa-4aaa-8aaa-333333333333", [
    ...sentFrom(api, minutesAgo(10), [ownerTurn("Api words.")]),
    ...sentFrom(join(api, "deleted-since"), minutesAgo(5), [ownerTurn("Words from a directory that is gone.")]),
  ]);

  const result = await candidates(["--project", "github.com/acme/web::", "--days", "7"]);

  expect(result.candidates.map((candidate) => candidate.parts)).toEqual([["Web words."]]);
  expect([result.other_projects, result.unresolved]).toEqual([1, 1]);
});

test("capture by transcript reference records the transcript's speaker, time and place, once per quote", async () => {
  const { configDir, web, run, candidates } = await mining();
  const saidAt = minutesAgo(15);
  writeSessionTranscript(
    configDir,
    "-acme-web",
    "44444444-aaaa-4aaa-8aaa-444444444444",
    sentFrom(web, saidAt, [ownerTurn("Prefer small modules. Name exports for grep.")]),
  );
  const [candidate] = (await candidates()).candidates;
  const reference = [
    "--transcript-session",
    candidate?.reference.session ?? "",
    "--transcript-message",
    candidate?.reference.message ?? "",
  ];
  const capture = (quote: string, extra: ReadonlyArray<string> = []) =>
    run(["capture", ...reference, "--quote", quote, ...extra, "--by", "claude-code/test", "--json"]);

  const first = Schema.decodeUnknownSync(CaptureJson)((await capture("Name exports for grep.")).stdout);
  const again = Schema.decodeUnknownSync(CaptureJson)((await capture("Name exports for grep.")).stdout);
  const other = Schema.decodeUnknownSync(CaptureJson)(
    // An agent passes its own directory as `in`; the message's cwd still places the capture.
    (await capture("Prefer small modules.", ["--in", makeGitRepo("git@github.com:acme/api.git")])).stdout,
  );

  expect(first.source.source.said_by).toBe(OWNER);
  expect(Date.parse(first.source.source.said_at)).toBe(Date.parse(saidAt));
  expect(first.source.source.captured_in).toEqual(["github.com/acme/web::"]);
  expect([first.already_captured, again.already_captured, again.source.source.id]).toEqual([
    false,
    true,
    first.source.source.id,
  ]);
  expect([other.already_captured, other.source.source.address]).toEqual([false, first.source.source.address]);
  expect(other.source.source.id).not.toBe(first.source.source.id);
  expect(other.source.source.captured_in).toEqual(["github.com/acme/web::"]);
});

test("capture by transcript reference refuses inexact quotes, contradicting fields, ineligible messages and escapes from the root", async () => {
  const { configDir, web, run } = await mining();
  const session = "55555555-aaaa-4aaa-8aaa-555555555555";
  const typed = ownerTurn('Keep it short.\n<pasted_content id="1">\npasted\n</pasted_content>\nThen ship.');
  const headless = ownerTurn("Headless words.", "sdk");
  writeSessionTranscript(configDir, "-acme-web", session, sentFrom(web, minutesAgo(5), [typed, headless]));
  const outside = makeTemporaryDirectory("outside");
  writeSessionTranscript(outside, "-elsewhere", "66666666-aaaa-4aaa-8aaa-666666666666", [
    ...sentFrom(web, minutesAgo(5), [ownerTurn("Outside words.")]),
  ]);
  mkdirSync(join(configDir, "projects", "-linked"));
  symlinkSync(
    join(outside, "projects", "-elsewhere", "66666666-aaaa-4aaa-8aaa-666666666666.jsonl"),
    join(configDir, "projects", "-linked", "77777777-aaaa-4aaa-8aaa-777777777777.jsonl"),
  );
  const failureTag = async (sessionId: string, message: string, quote: string, extra: ReadonlyArray<string> = []) => {
    const args = ["capture", "--transcript-session", sessionId, "--transcript-message", message, "--quote", quote];
    const result = await run([...args, ...extra, "--by", "claude-code/test", "--json"]);
    expect(result.exitCode).not.toBe(0);
    return Schema.decodeUnknownSync(FailureJson)(result.stdout).error.tag;
  };

  expect(await failureTag(session, typed.uuid, "Keep it short. Then ship.")).toBe("TranscriptQuoteNotFound");
  expect(await failureTag(session, typed.uuid, "Keep it short.", ["--said-at", minutesAgo(600)])).toBe(
    "TranscriptFieldConflict",
  );
  expect(await failureTag(session, typed.uuid, "Keep it short.", ["--said-by", "human:dana", "--label", "Dana"])).toBe(
    "TranscriptFieldConflict",
  );
  expect(await failureTag(session, headless.uuid, "Headless words.")).toBe("TranscriptMessageIneligible");
  expect(await failureTag("../outside", typed.uuid, "Keep it short.")).toBe("TranscriptReferenceUnresolved");
  expect(await failureTag("77777777-aaaa-4aaa-8aaa-777777777777", typed.uuid, "Outside words.")).toBe(
    "TranscriptReferenceUnresolved",
  );
});
