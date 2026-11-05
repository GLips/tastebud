/** Temp stores, real git checkouts, `taste` as a process, and a one-line way to run an operation as a caller would. */
import { afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runTasteOperation,
  type TasteError,
  type TasteOperationName,
  type TasteOperationOutput,
  type TasteOperationWireInput,
  type TasteServices,
} from "@taste/core/operations";
import { resolveTasteContext, type TasteContextRequest } from "@taste/core/place-context";
import { provideTasteStore } from "@taste/core/record-store";
import { starterTasteConfigText } from "@taste/core/store-config";
import { writeTasteConfigText } from "@taste/core/store-setup";
import type { TasteCaller } from "@taste/core/taste-caller";
import { Effect } from "effect";

const temporaryDirectories: Array<string> = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** A fresh realpath'd temp directory, removed after the test. */
export const makeTemporaryDirectory = (prefix: string) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), `taste-${prefix}-`)));
  temporaryDirectories.push(directory);
  return directory;
};

const TASTE_MAIN = join(import.meta.dir, "../packages/cli/src/main.ts");

/**
 * How a test starts `taste`: from source, or the compiled binary at `TASTE_TEST_BINARY` (the release workflow's
 * smoke run). `process.execPath`, not `bun` on PATH, so a test may hand `taste` a PATH without Bun.
 */
export const TASTE_COMMAND_LINE: ReadonlyArray<string> = process.env["TASTE_TEST_BINARY"]
  ? [process.env["TASTE_TEST_BINARY"]]
  : [process.execPath, TASTE_MAIN];

const isBunDirectory = (entry: string) => existsSync(join(entry, "bun")) || entry.includes("/bun-node-");

/**
 * This process's environment, for a `taste` child; `overrides` win. Against the compiled binary, PATH loses
 * every directory holding Bun (and the `node` shim Bun adds), so the smoke run proves it needs neither.
 */
export const tasteProcessEnv = (overrides: Readonly<Record<string, string>>): Record<string, string> => {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const path = process.env["TASTE_TEST_BINARY"]
    ? {
        PATH: (inherited["PATH"] ?? "")
          .split(":")
          .filter((entry) => !isBunDirectory(entry))
          .join(":"),
      }
    : {};
  return { ...inherited, ...path, ...overrides };
};

/** Runs `taste <args>` against `store` from `cwd` to completion. `env` replaces the inherited environment. */
export const runTaste = async (
  store: string,
  cwd: string,
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string>> = tasteProcessEnv({}),
) => {
  const child = Bun.spawn([...TASTE_COMMAND_LINE, ...args], {
    cwd,
    env: { ...env, TASTE_STORE: store },
    stdin: "ignore",
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

export const OWNER = "human:tester";
export const AGENT = "claude-code/test";

/** A store with the starter config, or with `configText` as its `taste.config.ts`. */
export const makeTestStore = async (configText?: string) => {
  const root = makeTemporaryDirectory("store");
  if (configText === undefined) await Effect.runPromise(writeTasteConfigText(root, starterTasteConfigText(OWNER), ""));
  else writeFileSync(join(root, "taste.config.ts"), configText);
  return root;
};

export const inStore = <A, E>(root: string, effect: Effect.Effect<A, E, TasteServices>) =>
  Effect.runPromise(provideTasteStore(root)(effect));

/** Runs `git` and returns stdout; throws with stderr on failure. */
export const git = (cwd: string, ...args: Array<string>) => {
  const result = Bun.spawnSync(["git", "-c", "user.email=t@example.com", "-c", "user.name=Tester", ...args], {
    cwd,
    // Under a git hook, GIT_DIR and friends would point these commands at this repo instead.
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
};

/** A repo with an `origin` remote and one commit, plus `subdirectories` created inside it. */
export const makeGitRepo = (remote: string | undefined, subdirectories: ReadonlyArray<string> = []) => {
  const repo = join(makeTemporaryDirectory("repo"), "checkout");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  if (remote !== undefined) git(repo, "remote", "add", "origin", remote);
  git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  for (const subdirectory of subdirectories) mkdirSync(join(repo, subdirectory), { recursive: true });
  return repo;
};

/** The caller a shell would build: context resolved from `request` (a cwd, `in` or `at`). */
export const callerFor = (root: string, request: TasteContextRequest, actor: string | undefined = AGENT) =>
  inStore(
    root,
    Effect.map(resolveTasteContext(request), (context): TasteCaller => ({
      via: "cli",
      context,
      ...(actor !== undefined && { actor }),
      ...(request.cwd !== undefined && { cwd: request.cwd }),
    })),
  );

/** The unknown-context caller MCP gets with no roots. */
export const unknownCaller: TasteCaller = { via: "mcp", actor: AGENT, context: { places: [], origin: "unknown" } };

export const runOperation = <N extends TasteOperationName>(
  root: string,
  name: N,
  input: TasteOperationWireInput,
  caller: TasteCaller,
): Promise<TasteOperationOutput<N>> => inStore(root, runTasteOperation(name, input, caller));

/** The failure an operation ends with; throws if it succeeds. */
export const failOperation = (
  root: string,
  name: TasteOperationName,
  input: TasteOperationWireInput,
  caller: TasteCaller,
): Promise<TasteError> =>
  Effect.runPromise(Effect.flip(provideTasteStore(root)(runTasteOperation(name, input, caller))));

/** A source said by the owner, captured from `caller`'s context. Returns its id. */
export const captureOwnerWords = async (root: string, caller: TasteCaller, quote: string, kind = "memory") => {
  const { source } = await runOperation(
    root,
    "capture",
    { kind, said_by: OWNER, said_by_label: "Tess", quote, said_at: "2026-10-19T10:30:00-07:00" },
    caller,
  );
  return source.source.id;
};

const DEMO_KINDS = `
  sourceKinds: {
    memory: { singular: "memory", plural: "memories" },
    "call-quote": { singular: "call quote", plural: "call quotes" },
  },
  derivedKinds: {
    belief: { singular: "belief", plural: "beliefs", sources: ["memory"], recall: "inject", acceptLabel: "Believe", proposalPrompt: "Propose beliefs." },
    insight: { singular: "insight", plural: "insights", sources: ["call-quote"], recall: "pull", acceptLabel: "Keep", proposalPrompt: "Propose insights." },
    idea: { singular: "idea", plural: "ideas", sources: ["call-quote", "memory"], recall: "never", acceptLabel: "Worth doing", proposalPrompt: "Propose ideas." },
  },`;

/** The demo's kinds (belief inject, insight pull, idea never) with `place` and `hook` as given. */
export const demoConfigText = (place: string, hook = "{ limit: 3, budgetMs: 650 }") =>
  `export default {\n  owner: "${OWNER}",\n  place: ${place},${DEMO_KINDS}\n  hook: ${hook},\n};\n`;
