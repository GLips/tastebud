/**
 * Every registry operation reaches its audience: agent operations through a CLI command (MCP lists them
 * from the registry on its own), human operations through a review repo. A new operation that no
 * shell calls fails here instead of shipping unreachable.
 */
import { expect, test } from "bun:test";
import { join } from "node:path";

import { listTasteOperations } from "@tastebud/core/operations";

const REPO_ROOT = join(import.meta.dir, "..");

/** The operation names a set of source files passes to `callee("<name>"`. */
const operationsCalledIn = async (pattern: string, callees: ReadonlyArray<string>): Promise<Set<string>> => {
  const called = new Set<string>();
  const call = new RegExp(`\\b(?:${callees.join("|")})\\(\\s*"([a-z-]+)"`, "g");
  for await (const path of new Bun.Glob(pattern).scan({ cwd: REPO_ROOT, absolute: true })) {
    for (const match of (await Bun.file(path).text()).matchAll(call)) called.add(match[1]!);
  }
  return called;
};

test("every agent operation has a CLI command", async () => {
  const called = await operationsCalledIn("packages/cli/src/features/*/controllers/*.ts", ["runCliOperation"]);
  const missing = listTasteOperations("agent").filter((operation) => !called.has(operation.name));
  expect(missing.map((operation) => operation.name)).toEqual([]);
});

test("every human operation has a review repo call", async () => {
  // `run` is the per-operation runner `runReviewOperations` hands its builder.
  const called = await operationsCalledIn("apps/review/src/features/*/repo/*.server.ts", ["runReviewOperation", "run"]);
  const missing = listTasteOperations("human").filter((operation) => !called.has(operation.name));
  expect(missing.map((operation) => operation.name)).toEqual([]);
});
