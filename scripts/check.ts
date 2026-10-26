import { fileURLToPath } from "node:url";

import getEffectTscPath from "@effect/tsgo/lib/getExePath";

/**
 * The gate: every check at once, each step's output printed whole when it ends. A failure in any
 * step fails the run after all of them have reported.
 *
 *   bun scripts/check.ts             every step (`bun run check`)
 *   bun scripts/check.ts typecheck   the typecheck steps alone (`bun run typecheck`)
 */
const root = fileURLToPath(new URL("../", import.meta.url));

// Every program the workspace declares, heaviest first so the slowest starts earliest. Each one
// checks its own tree under its own libs: core's has no DOM, so a browser global in core fails.
const typecheckPrograms = [
  ".",
  "apps/review",
  "packages/core",
  "packages/cli",
  "packages/mcp",
  "lint/oxlint",
  "lint/policy",
  "lint/structural",
];

// @effect/tsgo's compiler type-checks and reports the Effect language-service diagnostics in one
// pass; plain `tsc` ignores the `plugins` entry in tsconfig.base.json.
const effectTsc = getEffectTscPath();
const typecheckSteps = typecheckPrograms.map((program) => {
  const label = program === "." ? "root" : program.replaceAll("/", "-");
  return {
    name: `typecheck ${label}`,
    command: [
      effectTsc,
      "--noEmit",
      "--project",
      `${program}/tsconfig.json`,
      "--incremental",
      "--tsBuildInfoFile",
      `node_modules/.cache/taste-check/${label}.tsbuildinfo`,
    ],
  };
});
// `check:rules` runs the lint rules' own specs; `check:structural` runs the cross-file checks oxlint cannot.
const otherSteps = ["lint", "check:rules", "check:structural", "knip", "format:check", "test"].map((script) => ({
  name: script,
  command: ["bun", "run", script],
}));

const selection = process.argv[2];
if (selection !== undefined && selection !== "typecheck")
  throw new Error(`Unknown selection "${selection}": pass nothing, or "typecheck".`);
const steps = selection === "typecheck" ? typecheckSteps : [...typecheckSteps, ...otherSteps];

const started = performance.now();
const results = await Promise.all(
  steps.map(async (step) => {
    const stepStarted = performance.now();
    const child = Bun.spawn(step.command, { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const seconds = ((performance.now() - stepStarted) / 1000).toFixed(1);
    const verdict = exitCode === 0 ? "ok" : `FAILED (exit ${String(exitCode)})`;
    const output = `${stdout}${stderr}`.trimEnd();
    process.stdout.write(`\n── ${step.name}: ${verdict}, ${seconds}s\n${output === "" ? "" : `${output}\n`}`);
    return { name: step.name, passed: exitCode === 0 };
  }),
);

const failed = results.filter((result) => !result.passed).map((result) => result.name);
const seconds = ((performance.now() - started) / 1000).toFixed(1);
process.stdout.write(
  failed.length === 0
    ? `\n✓ ${String(results.length)} steps passed in ${seconds}s\n`
    : `\n✗ ${String(failed.length)} of ${String(results.length)} steps failed in ${seconds}s: ${failed.join(", ")}\n`,
);
process.exitCode = failed.length === 0 ? 0 : 1;
