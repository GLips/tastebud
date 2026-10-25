/** The CLI end to end, as an agent's shell runs it: a real process, a temp store, a real git repo. */
import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { AGENT, makeGitRepo, makeTestStore, OWNER } from "./support.ts";

const MAIN = join(import.meta.dir, "../src/cli/main.ts");

const runTaste = async (store: string, cwd: string, args: ReadonlyArray<string>) => {
  const child = Bun.spawn(["bun", MAIN, ...args], {
    cwd,
    env: { ...process.env, TASTE_STORE: store },
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

const countRecordFiles = (store: string) =>
  readdirSync(store, { recursive: true }).filter((path) => String(path).endsWith(".md")).length;

test("capture, propose and recall --json from a repo; a repeat exits 3 and decide writes nothing", async () => {
  const store = await makeTestStore();
  const repo = makeGitRepo("git@github.com:acme/web.git", ["apps/checkout"]);
  const checkout = join(repo, "apps/checkout");

  const captured = await runTaste(store, checkout, [
    "capture",
    "--said-by",
    OWNER,
    "--label",
    "Tess",
    "--quote",
    "No default exports, ever.",
    "--by",
    AGENT,
    "--json",
  ]);
  expect(captured.exitCode).toBe(0);
  const sourceId: string = JSON.parse(captured.stdout).source.source.id;

  const proposeArgs = ["propose", "--kind", "belief", "--statement", "Use named exports, never default exports"];
  proposeArgs.push("--supports", sourceId, "--reasoning", "She said so outright.", "--by", AGENT, "--json");
  const proposed = await runTaste(store, checkout, proposeArgs);
  expect(proposed.exitCode).toBe(0);
  const derivation = JSON.parse(proposed.stdout).derivation;
  // Proposed from a subdirectory, the defaulted scope is the repo root.
  expect(derivation.proposedScope).toEqual({ scope: "places", places: ["github.com/acme/web::"] });

  const repeated = await runTaste(store, checkout, proposeArgs);
  expect(repeated.exitCode).toBe(3);
  expect(JSON.parse(repeated.stdout).error.tag).toBe("NearRepeat");

  const recalled = await runTaste(store, repo, ["recall", "default exports", "--json"]);
  expect(recalled.exitCode).toBe(0);
  const recall = JSON.parse(recalled.stdout);
  expect(recall.context).toMatchObject({ origin: "cwd", places: ["github.com/acme/web::"] });
  expect(recall.sources.map((hit: { source: { id: string } }) => hit.source.id)).toContain(sourceId);

  const before = countRecordFiles(store);
  const decided = await runTaste(store, repo, ["decide", derivation.id]);
  expect(decided.exitCode).toBe(0);
  expect(decided.stdout.trim()).toEndWith(`/derivations/${derivation.id}`);
  expect(countRecordFiles(store)).toBe(before);
});
