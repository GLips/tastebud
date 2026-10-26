/** The demo seed, which writes every record through core's operations, so the store it leaves must read back whole. */
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { provideTasteStore, runTasteOperation } from "@taste/core";
import { UNKNOWN_TASTE_CONTEXT } from "@taste/core/places";
import { Effect } from "effect";

const MAIN = join(import.meta.dir, "../packages/cli/src/main.ts");

test("the demo seed covers every status with a history that runs forward from evidence to decision", async () => {
  const root = join(mkdtempSync(join(tmpdir(), "taste-seed-")), "store");
  const seeded = Bun.spawnSync(["bun", MAIN, "seed", "--store", root], { stdout: "pipe", stderr: "pipe" });
  expect(seeded.stderr.toString()).toBe("");
  expect(seeded.exitCode).toBe(0);

  const { derivations } = await Effect.runPromise(
    provideTasteStore(root)(runTasteOperation("list", {}, { via: "cli", context: UNKNOWN_TASTE_CONTEXT })),
  );
  expect(new Set(derivations.map((derivation) => derivation.status))).toEqual(
    new Set(["pending", "accepted", "rejected", "retracted", "superseded"]),
  );
  // Stamps come from the seed's story clock, not the machine's.
  const proposedAt = derivations.map((derivation) => Date.parse(derivation.proposedAt));
  expect(Math.min(...proposedAt)).toBeLessThan(Date.parse("2026-09-10T00:00:00Z"));
  expect(Math.max(...proposedAt)).toBeLessThanOrEqual(Date.parse("2026-10-25T00:00:00Z"));
});
