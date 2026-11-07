/**
 * The catch-up: `tastebud catch-up` says what waits since the last one, per origin, and
 * `catch-up-done` advances only the origins it read, run as processes against synthetic transcripts.
 */
import { expect, test } from "bun:test";

import { Schema } from "effect";

import { assistantSays, ownerTurn, sentFrom, writeSessionTranscript } from "./claude-code-transcript.ts";
import {
  demoConfigText,
  makeGitRepo,
  makeTemporaryDirectory,
  makeTestStore,
  runTastebud,
  tastebudProcessEnv,
} from "./support.ts";

const StatusJson = Schema.fromJsonString(
  Schema.Struct({
    first: Schema.Boolean,
    origins: Schema.Array(
      Schema.Struct({
        kind: Schema.String,
        read_through: Schema.optionalKey(Schema.String),
        last_run_in: Schema.Array(Schema.String),
        sessions: Schema.optionalKey(
          Schema.Struct({
            messages: Schema.Int,
            read_until: Schema.String,
            left_for_next: Schema.Int,
            batches: Schema.Array(Schema.Struct({ command: Schema.String })),
          }),
        ),
      }),
    ),
    kinds: Schema.Array(Schema.Struct({ kind: Schema.String, policy: Schema.String, due: Schema.Int })),
  }),
);
const CandidatesJson = Schema.fromJsonString(
  Schema.Struct({
    candidates: Schema.Array(
      Schema.Struct({
        reference: Schema.Struct({ session: Schema.String, message: Schema.String }),
        parts: Schema.Array(Schema.String),
        similarity: Schema.optionalKey(Schema.Number),
      }),
    ),
  }),
);
const CaptureJson = Schema.fromJsonString(
  Schema.Struct({ source: Schema.Struct({ source: Schema.Struct({ id: Schema.String, before: Schema.String }) }) }),
);

const CapturedJson = Schema.fromJsonString(
  Schema.Struct({
    source: Schema.Struct({ source: Schema.Struct({ id: Schema.String }) }),
    already_captured: Schema.Boolean,
  }),
);

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const catchingUp = async () => {
  const store = await makeTestStore(demoConfigText(`"git",\n  conversationSourceKind: "memory"`));
  const configDir = makeTemporaryDirectory("claude-config");
  const web = makeGitRepo("git@github.com:acme/web.git");
  const run = async (args: ReadonlyArray<string>) => {
    const result = await runTastebud(store, web, args, tastebudProcessEnv({ CLAUDE_CONFIG_DIR: configDir }));
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    return result.stdout;
  };
  const status = async () => Schema.decodeUnknownSync(StatusJson)(await run(["catch-up", "--json"]));
  const origin = async (kind: string) => (await status()).origins.find((entry) => entry.kind === kind);
  return { configDir, web, run, status, origin };
};

test("a catch-up advances only the origins it read, and the next one starts from there", async () => {
  const { configDir, web, run, status, origin } = await catchingUp();
  const squashAt = minutesAgo(30);
  writeSessionTranscript(configDir, "-acme-web", "11111111-aaaa-4aaa-8aaa-111111111111", [
    ...sentFrom(web, squashAt, [assistantSays("Should I squash the commits?"), ownerTurn("Yes, always squash.")]),
    ...sentFrom(web, minutesAgo(10), [ownerTurn("Later words.")]),
  ]);

  const before = await status();
  const sessions = before.origins.find((entry) => entry.kind === "memory")?.sessions;
  expect(before.first).toBe(true);
  expect([sessions?.messages, sessions?.left_for_next]).toEqual([2, 0]);

  const listed = Schema.decodeUnknownSync(CandidatesJson)(
    await run(["transcript-candidates", "--days", "7", "--before", sessions?.read_until ?? "", "--json"]),
  );
  const [candidate] = listed.candidates;
  const captured = Schema.decodeUnknownSync(CaptureJson)(
    await run([
      "capture",
      "--transcript-session",
      candidate?.reference.session ?? "",
      "--transcript-message",
      candidate?.reference.message ?? "",
      "--quote",
      "always squash",
      "--by",
      "claude-code/test",
      "--json",
    ]),
  );
  // The agent's question is what "Yes" answers, so the source keeps it.
  expect(captured.source.source.before).toBe("Should I squash the commits?");
  const policies = before.kinds.flatMap((kind) => (kind.kind === "insight" ? [] : ["--considered-for", kind.policy]));
  // This catch-up got as far as the squash message, so it records that much.
  const done = ["catch-up-done", "--origin", "memory", "--read-through", squashAt];
  const weighed = ["--considered", captured.source.source.id, ...policies, "--by", "claude-code/test"];
  await run([...done, ...weighed]);
  // A retry of the same receipt is the same receipt.
  expect(await run([...done, ...weighed])).toContain("Already recorded");

  const after = await status();
  expect(after.first).toBe(false);
  expect(after.origins.find((entry) => entry.kind === "memory")?.sessions?.messages).toBe(1);
  expect((await origin("memory"))?.last_run_in).toEqual(["github.com/acme/web::"]);
  // Call quotes come through some other tool this catch-up never reached, so they still wait.
  expect((await origin("call-quote"))?.read_through).toBeUndefined();
  expect(after.kinds.map((kind) => [kind.kind, kind.due])).toEqual([
    ["belief", 0],
    ["insight", 0],
    ["idea", 0],
  ]);
});

test("a backlog is split into subagent batches that together read up to where the budget ran out", async () => {
  const { configDir, web, origin, run } = await catchingUp();
  // ~62k tokens each at 4 characters a token: four fit the 300k budget, two to a 150k batch; the fifth waits.
  const long = "word ".repeat(50_000);
  writeSessionTranscript(configDir, "-acme-web", "33333333-aaaa-4aaa-8aaa-333333333333", [
    ...sentFrom(web, minutesAgo(40), [ownerTurn(`First ${long}`)]),
    ...sentFrom(web, minutesAgo(30), [ownerTurn(`Second ${long}`)]),
    ...sentFrom(web, minutesAgo(20), [ownerTurn(`Third ${long}`)]),
    ...sentFrom(web, minutesAgo(10), [ownerTurn(`Fourth ${long}`)]),
    ...sentFrom(web, minutesAgo(5), [ownerTurn(`Fifth ${long}`)]),
  ]);

  const sessions = (await origin("memory"))?.sessions;

  expect([sessions?.messages, sessions?.left_for_next, sessions?.batches.length]).toEqual([5, 1, 2]);
  expect(Date.parse(sessions?.read_until ?? "")).toBeLessThan(Date.now() - 7 * 60_000);
  // Each batch command reads exactly its own messages.
  const firstWords = await Promise.all(
    (sessions?.batches ?? []).map(async (batch) => {
      const listed = Schema.decodeUnknownSync(CandidatesJson)(await run(batch.command.split(" ").slice(1)));
      return listed.candidates.map((candidate) => candidate.parts[0]?.split(" ")[0]);
    }),
  );
  expect(firstWords).toEqual([
    ["First", "Second"],
    ["Third", "Fourth"],
  ]);
});

test("similar-to finds a request repeated across sessions, once per message however often a fork copies it", async () => {
  const { configDir, web, run } = await catchingUp();
  const asked = ownerTurn("I walked away, where did we land with everything?");
  const askedAt = minutesAgo(60 * 24 * 3);
  writeSessionTranscript(configDir, "-acme-web", "44444444-aaaa-4aaa-8aaa-444444444444", [
    ...sentFrom(web, askedAt, [asked]),
  ]);
  // A fork copies the message under a new uuid; a resume keeps the old one.
  writeSessionTranscript(configDir, "-acme-web", "55555555-aaaa-4aaa-8aaa-555555555555", [
    ...sentFrom(web, askedAt, [{ ...asked, uuid: "aaaaaaaa-0000-4000-8000-000000000000" }, asked]),
    ...sentFrom(web, minutesAgo(60), [
      ownerTurn("Where did we land? What's outstanding?"),
      ownerTurn("Rename the file."),
    ]),
  ]);

  const found = Schema.decodeUnknownSync(CandidatesJson)(
    await run(["transcript-candidates", "--similar-to", "where did we land", "--json"]),
  );

  expect(found.candidates.map((candidate) => candidate.parts[0])).toEqual([
    "I walked away, where did we land with everything?",
    "Where did we land? What's outstanding?",
  ]);
  const capture = async (session: string, message: string) =>
    Schema.decodeUnknownSync(CapturedJson)(
      await run([
        "capture",
        "--transcript-session",
        session,
        "--transcript-message",
        message,
        "--quote",
        "where did we land",
        "--by",
        "claude-code/test",
        "--json",
      ]),
    );
  const first = await capture("44444444-aaaa-4aaa-8aaa-444444444444", asked.uuid);
  const throughFork = await capture("55555555-aaaa-4aaa-8aaa-555555555555", "aaaaaaaa-0000-4000-8000-000000000000");
  expect([throughFork.already_captured, throughFork.source.source.id]).toEqual([true, first.source.source.id]);
});
