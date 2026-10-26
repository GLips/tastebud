/** Temp stores, real git checkouts, and a one-line way to run an operation as a caller would. */
import { afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  initStore,
  provideTasteStore,
  resolveTasteContext,
  runTasteOperation,
  type TasteCaller,
  type TasteContextRequest,
  type TasteError,
  type TasteOperationName,
  type TasteOperationOutput,
  type TasteStore,
} from "@taste/core";
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

export const OWNER = "human:tester";
export const AGENT = "claude-code/test";

/** A store with the starter config, or with `configText` as its `taste.config.ts`. */
export const makeTestStore = async (configText?: string) => {
  const root = makeTemporaryDirectory("store");
  if (configText === undefined) await Effect.runPromise(initStore(root, OWNER));
  else writeFileSync(join(root, "taste.config.ts"), configText);
  return root;
};

export const inStore = <A, E>(root: string, effect: Effect.Effect<A, E, TasteStore>) =>
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
  input: unknown,
  caller: TasteCaller,
): Promise<TasteOperationOutput<N>> => inStore(root, runTasteOperation(name, input, caller));

/** The failure an operation ends with; throws if it succeeds. */
export const failOperation = (
  root: string,
  name: TasteOperationName,
  input: unknown,
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
