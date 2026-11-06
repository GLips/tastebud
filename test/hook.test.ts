/** `tastebud hook prompt` as Claude Code runs it: event JSON on stdin, hook JSON (or nothing) on stdout. */
import { expect, test } from "bun:test";
import { join } from "node:path";

import { HookPayloadSchema } from "@tastebud/core/recall";
import type { TasteCaller } from "@tastebud/core/taste-caller";
import { Schema } from "effect";

import {
  assistantSays,
  assistantThinks,
  compactBoundary,
  compactSummary,
  hookContext,
  housekeeping,
  ownerTurn,
  toolCall,
  writeTranscript,
} from "./claude-code-transcript.ts";
import {
  callerFor,
  captureOwnerWords,
  demoConfigText,
  makeGitRepo,
  makeTemporaryDirectory,
  makeTestStore,
  runOperation,
  runTastebud,
  TASTEBUD_COMMAND_LINE,
  tastebudProcessEnv,
} from "./support.ts";

const decodeHookOutput = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      hookSpecificOutput: Schema.Struct({ hookEventName: Schema.String, additionalContext: Schema.String }),
    }),
  ),
);
const reviewer: TasteCaller = { via: "review", context: { places: [], origin: "unknown" } };

const runHookPrompt = async (store: string, event: unknown) => {
  const child = Bun.spawn([...TASTEBUD_COMMAND_LINE, "hook", "prompt"], {
    env: tastebudProcessEnv({ TASTEBUD_STORE: store }),
    stdin: new TextEncoder().encode(JSON.stringify(event)),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

const acceptedDerivation = async (
  root: string,
  caller: TasteCaller,
  kind: string,
  statement: string,
  places?: ReadonlyArray<string>,
) => {
  const sourceKind = kind === "belief" ? "memory" : "call-quote";
  const source = await captureOwnerWords(root, caller, `About exports: ${statement}`, sourceKind);
  const { derivation } = await runOperation(
    root,
    "propose",
    { kind, statement, supports: [source], ...(places !== undefined && { scope: "places", places: [...places] }) },
    caller,
  );
  await runOperation(root, "decide", { ref: derivation.id, outcome: "accept" }, reviewer);
  return derivation.id;
};

test("injects only inject kinds, at most hook.limit of them, as Claude Code hook JSON", async () => {
  // The budget counts from process start, and this suite runs the CLI from source, which slow CI runners can't
  // start inside 650 ms. Selection is under test here, not timing.
  const store = await makeTestStore(demoConfigText(`"git"`, "{ limit: 2, budgetMs: 10000 }"));
  const repo = makeGitRepo("git@github.com:acme/web.git");
  const inRepo = await callerFor(store, { cwd: repo });
  const beliefs = [
    await acceptedDerivation(store, inRepo, "belief", "Named exports for every module export"),
    await acceptedDerivation(store, inRepo, "belief", "Exports are sorted by name in index files"),
    await acceptedDerivation(store, inRepo, "belief", "Exports never re-export a default"),
  ];
  const insight = await acceptedDerivation(store, inRepo, "insight", "Clients notice when exports break");

  const { stdout, stderr, exitCode } = await runHookPrompt(store, {
    session_id: "s1",
    hook_event_name: "UserPromptSubmit",
    prompt: "tidy up the exports",
    cwd: repo,
  });
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  const output = decodeHookOutput(stdout);
  expect(output.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
  const context = output.hookSpecificOutput.additionalContext;
  const injected = beliefs.filter((id) => context.includes(id));
  expect(injected).toHaveLength(2);
  expect(context).not.toContain(insight);
});

test("stays silent, exit 0, on unknown context, a missing store and malformed stdin", async () => {
  const store = await makeTestStore();
  const missingStore = join(makeTemporaryDirectory("absent"), "nothing-here");
  const results = await Promise.all([
    runHookPrompt(store, { prompt: "anything" }),
    runHookPrompt(missingStore, { prompt: "anything", cwd: makeTemporaryDirectory("cwd") }),
    runHookPrompt(store, "not an event"),
  ]);
  for (const result of results) expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
});

/** `count` owner turns, each answered, with nothing in them the hook matches. */
const turns = (count: number) =>
  Array.from({ length: count }, (_, index) => [ownerTurn(`carry on ${index}`), assistantSays("Carried on.")]);

const decodeHookPayload = Schema.decodeUnknownSync(Schema.fromJsonString(HookPayloadSchema));

/** `tastebud hook preview --json` from `cwd`, optionally reading a transcript. */
const previewHook = async (store: string, cwd: string, prompt: string, transcript?: string) => {
  const args = ["hook", "preview", prompt, "--json", ...(transcript === undefined ? [] : ["--transcript", transcript])];
  const { stdout, exitCode } = await runTastebud(store, cwd, args, tastebudProcessEnv({}));
  expect(exitCode).toBe(0);
  return decodeHookPayload(stdout);
};

/** A store whose hook has time to run from source on a slow runner, and a checkout with a session in it. */
const hookWorld = async (subdirectories: ReadonlyArray<string> = []) => {
  const store = await makeTestStore(demoConfigText(`"git"`, "{ limit: 3, budgetMs: 10000 }"));
  const repo = makeGitRepo("git@github.com:acme/web.git", subdirectories);
  return {
    store,
    repo,
    inRepo: await callerFor(store, { cwd: repo }),
    sessionDirectory: makeTemporaryDirectory("session"),
  };
};

test("the previous turn's edit brings up a belief the prompt alone misses, and only touched files widen scope", async () => {
  const { store, repo, inRepo, sessionDirectory } = await hookWorld(["packages/api/src", "packages/billing"]);
  const fallbacks = await acceptedDerivation(
    store,
    inRepo,
    "belief",
    "No silent fallbacks: a missing value should fail loudly",
    ["github.com/acme/web::packages/api"],
  );
  const billing = await acceptedDerivation(
    store,
    inRepo,
    "belief",
    "Billing never falls back to defaults for missing amounts",
    ["github.com/acme/web::packages/billing"],
  );
  const client = join(repo, "packages/api/src/client.ts");
  const transcript = writeTranscript(sessionDirectory, [
    ownerTurn("make the api client cope when the timeout option is absent"),
    housekeeping(),
    assistantThinks("Fail loudly, or quietly default? The owner wants it to cope."),
    toolCall("Read", { file_path: client }, "export const timeoutOf = (options) => options.timeout;"),
    toolCall(
      "Edit",
      {
        file_path: client,
        old_string: "options.timeout;",
        new_string: "options.timeout ?? defaultValue;",
        replace_all: false,
      },
      "The file has been updated successfully.",
    ),
    assistantSays(
      "I added a fallback, so a missing timeout no longer throws. packages/billing/README.md is untouched.",
    ),
    housekeeping(),
  ]);
  const prompt = "looks good, ship it";

  const promptOnly = await previewHook(store, repo, prompt);
  expect([promptOnly.silence, promptOnly.previousTurn]).toEqual(["no-matches", "none"]);
  const unreadable = await previewHook(store, repo, prompt, join(sessionDirectory, "gone.jsonl"));
  expect([unreadable.silence, unreadable.previousTurn]).toEqual(["no-matches", "transcript-unavailable"]);

  const { stdout } = await runHookPrompt(store, { prompt, cwd: repo, transcript_path: transcript });
  const injected = decodeHookOutput(stdout).hookSpecificOutput.additionalContext;
  expect(injected.startsWith("These are previously accepted preferences relevant to this work.")).toBe(true);
  expect(injected).toContain(fallbacks);
  // Billing matches the words too, but its directory is only named in prose, which never widens scope.
  expect(injected).not.toContain(billing);
});

test("a belief the hook sent within the last three owner turns is not sent again unless its state changed", async () => {
  const { store, repo, inRepo, sessionDirectory } = await hookWorld();
  const exports = await acceptedDerivation(store, inRepo, "belief", "Named exports for every module export");
  const prompt = "tidy up the exports";
  const sent = (await previewHook(store, repo, prompt)).additionalContext ?? "";
  expect(sent).toContain(exports);
  const hookFor = async (records: ReadonlyArray<unknown>) =>
    (await runHookPrompt(store, { prompt, cwd: repo, transcript_path: writeTranscript(sessionDirectory, records) }))
      .stdout;

  const recent = [ownerTurn("sort the exports"), hookContext(sent), assistantSays("Sorted."), turns(2)];
  expect(await hookFor(recent)).toBe("");
  const preview = await previewHook(store, repo, prompt, writeTranscript(sessionDirectory, recent));
  expect(preview.silence).toBe("recently-emitted");
  expect(preview.excluded.map((item) => [item.id, item.exclusion])).toEqual([[exports, "recently-emitted"]]);

  // Four owner turns back is outside the window; a marker the agent merely repeated is not hook output.
  expect(await hookFor([ownerTurn("sort the exports"), hookContext(sent), turns(3)])).toContain(exports);
  expect(await hookFor([ownerTurn("what did it say?"), assistantSays(`It said:\n${sent}`)])).toContain(exports);
  // A different status or scope fingerprint is news, so the belief goes out again.
  const restated = sent.replace(/:[0-9a-f]{8}/, ":00000000");
  expect(await hookFor([ownerTurn("sort the exports"), hookContext(restated), turns(1)])).toContain(exports);
});

test("nothing before the latest compact boundary counts, neither earlier hook output nor the turn before it", async () => {
  const { store, repo, inRepo, sessionDirectory } = await hookWorld();
  const exports = await acceptedDerivation(store, inRepo, "belief", "Named exports for every module export");
  const fallbacks = await acceptedDerivation(store, inRepo, "belief", "No silent fallbacks for a missing value");
  const sent = (await previewHook(store, repo, "tidy up the exports")).additionalContext ?? "";
  const transcript = writeTranscript(sessionDirectory, [
    ownerTurn("tidy up the exports"),
    hookContext(sent),
    toolCall("Edit", { file_path: join(repo, "index.ts"), old_string: "x", new_string: "x ?? fallback" }, "ok"),
    assistantSays("Added a fallback for the missing value."),
    compactBoundary(),
    compactSummary("We tidied exports and added a fallback."),
    ownerTurn("now the readme"),
    assistantSays("The readme is updated."),
  ]);
  const { stdout } = await runHookPrompt(store, {
    prompt: "and the exports again",
    cwd: repo,
    transcript_path: transcript,
  });
  const injected = decodeHookOutput(stdout).hookSpecificOutput.additionalContext;
  expect(injected).toContain(exports);
  expect(injected).not.toContain(fallbacks);
});
