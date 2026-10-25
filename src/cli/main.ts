#!/usr/bin/env bun
/**
 * `taste`: the CLI. Exit codes: 0 ok, 1 broken (a bug or a corrupt store), 2 invalid input,
 * 3 refused (a near repeat to name with --despite, or a retired kind), 4 conflict (already decided).
 */
// The prompt hook runs before every prompt, so it skips loading effect/cli and the command tree.
// `--help` falls through to the full CLI, which prints the registered `hook prompt` help.
const hookArgs = process.argv.slice(4);
if (
  process.argv[2] === "hook" &&
  process.argv[3] === "prompt" &&
  !hookArgs.includes("--help") &&
  !hookArgs.includes("-h")
) {
  const storeAt = hookArgs.indexOf("--store");
  const storeFlag =
    storeAt === -1
      ? hookArgs.find((arg) => arg.startsWith("--store="))?.slice("--store=".length)
      : hookArgs[storeAt + 1];
  const { runTasteHookPrompt } = await import("./hook-prompt.ts");
  await runTasteHookPrompt(storeFlag);
}

const { runTasteCli } = await import("./cli.ts");
await runTasteCli();
