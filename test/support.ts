/** Temp stores, real git checkouts, `tastebud` as a process, a fake GitHub release, and a one-line way to run an operation as a caller would. */
import { afterEach, expect } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runTasteOperation,
  type TasteError,
  type TasteOperationName,
  type TasteOperationOutput,
  type TasteOperationWireInput,
  type TasteServices,
} from "@tastebud/core/operations";
import { resolveTasteContext, type TasteContextRequest } from "@tastebud/core/place-context";
import { provideTasteStore } from "@tastebud/core/record-store";
import { starterTastebudConfigText } from "@tastebud/core/store-config";
import { writeTastebudConfigText } from "@tastebud/core/store-setup";
import type { TasteCaller } from "@tastebud/core/taste-caller";
import { TASTEBUD_VERSION } from "@tastebud/core/taste-vocabulary";
import { Effect } from "effect";

const temporaryDirectories: Array<string> = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** A fresh realpath'd temp directory, removed after the test. */
export const makeTemporaryDirectory = (prefix: string) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), `tastebud-${prefix}-`)));
  temporaryDirectories.push(directory);
  return directory;
};

const TASTEBUD_MAIN = join(import.meta.dir, "../packages/cli/src/main.ts");

/**
 * How a test starts `tastebud`: from source, or the compiled binary at `TASTEBUD_TEST_BINARY` (the release workflow's
 * smoke run). `process.execPath`, not `bun` on PATH, so a test may hand `tastebud` a PATH without Bun.
 */
export const TASTEBUD_COMMAND_LINE: ReadonlyArray<string> = process.env["TASTEBUD_TEST_BINARY"]
  ? [process.env["TASTEBUD_TEST_BINARY"]]
  : [process.execPath, TASTEBUD_MAIN];

const isBunDirectory = (entry: string) => existsSync(join(entry, "bun")) || entry.includes("/bun-node-");

/**
 * This process's environment, for a `tastebud` child; `overrides` win. Against the compiled binary, PATH loses
 * every directory holding Bun (and the `node` shim Bun adds), so the smoke run proves it needs neither.
 */
export const tastebudProcessEnv = (overrides: Readonly<Record<string, string>>): Record<string, string> => {
  // The developer's own TASTEBUD_BIN or TASTEBUD_STORE (Claude Code passes its settings `env` to every
  // command) would point a test at their checkout or store; only the test's own overrides set those.
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && (!entry[0].startsWith("TASTEBUD_") || entry[0] === "TASTEBUD_TEST_BINARY"),
    ),
  );
  const path = process.env["TASTEBUD_TEST_BINARY"]
    ? {
        PATH: (inherited["PATH"] ?? "")
          .split(":")
          .filter((entry) => !isBunDirectory(entry))
          .join(":"),
      }
    : {};
  return { ...inherited, ...path, ...overrides };
};

/** Runs `tastebud <args>` against `store` from `cwd` to completion. `env` replaces the inherited environment. */
export const runTastebud = async (
  store: string,
  cwd: string,
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string>> = tastebudProcessEnv({}),
) => {
  const child = Bun.spawn([...TASTEBUD_COMMAND_LINE, ...args], {
    cwd,
    env: { ...env, TASTEBUD_STORE: store },
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

/**
 * The review port test stores link to. Never the default 4747, where the owner's own review server may be up:
 * `review-url` probes the port it links to. Outside the 4800-4899 range review tests serve on.
 */
export const TEST_REVIEW_PORT = 4799;

/** A store with the starter config, or with `configText` as its `tastebud.config.ts`. */
export const makeTestStore = async (configText?: string) => {
  const root = makeTemporaryDirectory("store");
  if (configText === undefined) {
    const starter = starterTastebudConfigText(OWNER).replace("port: 4747", `port: ${TEST_REVIEW_PORT}`);
    await Effect.runPromise(writeTastebudConfigText(root, starter, ""));
  } else writeFileSync(join(root, "tastebud.config.ts"), configText);
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

/** The demo's kinds (belief inject, insight pull, idea never) with `place`, `hook` and the review port as given. */
export const demoConfigText = (place: string, hook = "{ limit: 3, budgetMs: 650 }", reviewPort = TEST_REVIEW_PORT) =>
  `export default {\n  owner: "${OWNER}",\n  place: ${place},${DEMO_KINDS}\n  hook: ${hook},\n  review: { port: ${reviewPort} },\n};\n`;

/**
 * A shell script standing in for the release binary: `--version` answers as this release does, because
 * install.sh refuses to cache a binary that doesn't, and every other run does `body`.
 */
export const fakeTastebudBinary = (body: string) =>
  `#!/bin/sh\nif [ "$1" = --version ]; then echo "tastebud v${TASTEBUD_VERSION}"; exit 0; fi\n${body}\n`;

/**
 * A GitHub release for install.sh to reach through TASTEBUD_INSTALL_BASE_URL: a server in 4900-4999 with
 * this platform's archive of `binary` and its SHA256SUMS, counting archive fetches.
 */
export const serveFakeRelease = async (binary: string | Uint8Array) => {
  const work = makeTemporaryDirectory("release");
  const archive = `tastebud-${process.platform}-${process.arch === "arm64" ? "arm64" : "x64"}.tar.gz`;
  writeFileSync(join(work, "tastebud"), binary);
  chmodSync(join(work, "tastebud"), 0o755);
  expect(Bun.spawnSync(["tar", "-czf", archive, "tastebud"], { cwd: work }).exitCode).toBe(0);
  const bytes = readFileSync(join(work, archive));
  const sums = `${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}  ${archive}\n`;
  const fetched = { archives: 0 };
  for (let port = 4900; port < 5000; port += 1) {
    try {
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port,
        fetch: (request) => {
          const path = new URL(request.url).pathname;
          if (path === `/${archive}`) {
            fetched.archives += 1;
            return new Response(bytes);
          }
          return path === "/SHA256SUMS" ? new Response(sums) : new Response("missing", { status: 404 });
        },
      });
      return { server, fetched, url: `http://127.0.0.1:${String(port)}` };
    } catch {
      // Taken: try the next one.
    }
  }
  throw new Error("no free port in 4900-4999");
};
