#!/usr/bin/env bun
/**
 * `taste`: the CLI. Exit codes: 0 ok, 1 broken (a bug or a corrupt store), 2 invalid input,
 * 3 refused (a near repeat to name with --despite, or a retired kind), 4 conflict (already decided).
 */
// The prompt hook runs before every prompt, so it skips loading effect/cli and the command tree.
if (process.argv[2] === "hook" && process.argv[3] === "prompt") {
  const { runTasteHookPrompt } = await import("./hook-prompt.ts");
  await runTasteHookPrompt();
}

const { runTasteCli } = await import("./cli.ts");
await runTasteCli();
