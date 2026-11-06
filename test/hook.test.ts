/** `tastebud hook prompt` as Claude Code runs it: event JSON on stdin, hook JSON (or nothing) on stdout. */
import { expect, test } from "bun:test";
import { join } from "node:path";

import type { TasteCaller } from "@tastebud/core/taste-caller";
import { Schema } from "effect";

import {
  callerFor,
  captureOwnerWords,
  demoConfigText,
  makeGitRepo,
  makeTemporaryDirectory,
  makeTestStore,
  runOperation,
  TASTEBUD_COMMAND_LINE,
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
    env: { ...process.env, TASTEBUD_STORE: store },
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

const acceptedDerivation = async (root: string, caller: TasteCaller, kind: string, statement: string) => {
  const sourceKind = kind === "belief" ? "memory" : "call-quote";
  const source = await captureOwnerWords(root, caller, `About exports: ${statement}`, sourceKind);
  const { derivation } = await runOperation(root, "propose", { kind, statement, supports: [source] }, caller);
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
