// The allowlist checked against the `effect` that core actually installs, so an
// upgrade that renames a pure area, or drops the IO areas the rule specs name,
// fails here rather than leaving those specs testing paths that no longer exist.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";

import { isPureEffectSpecifier, PURE_EFFECT_AREAS } from "./pure-effect-specifiers.ts";

const requireFromCore = createRequire(resolve(import.meta.dirname, "../../../packages/core/package.json"));
const installedEffectManifest: unknown = requireFromCore("effect/package.json");
if (
  typeof installedEffectManifest !== "object" ||
  installedEffectManifest === null ||
  !("exports" in installedEffectManifest)
)
  throw new Error("effect/package.json has no export map; the allowlist has nothing to be checked against.");
const installedEffectExports: unknown = installedEffectManifest.exports;
if (typeof installedEffectExports !== "object" || installedEffectExports === null)
  throw new Error("effect/package.json `exports` is not an object.");
const installedEffectAreas = Object.keys(installedEffectExports)
  .map((key) => key.replace(/^\.\/?/, ""))
  .filter((area) => /^[a-z][a-z-]*$/.test(area) && area !== "index");

void test("every pure area is a subpath the installed effect exports", () => {
  for (const area of PURE_EFFECT_AREAS) assert.ok(installedEffectAreas.includes(area), `effect/${area}`);
});

void test("every other installed lowercase area, the IO ones included, is impure", () => {
  assert.ok(installedEffectAreas.includes("http") && installedEffectAreas.includes("process"));
  const pureAreas: readonly string[] = PURE_EFFECT_AREAS;
  for (const area of installedEffectAreas.filter((name) => !pureAreas.includes(name)))
    assert.equal(isPureEffectSpecifier(`effect/${area}`), false, `effect/${area}`);
});
