#!/usr/bin/env bun
/**
 * `taste`: the CLI. Exit codes: 0 ok, 1 broken (a bug or a corrupt store), 2 invalid input,
 * 3 refused (a near repeat to name with --despite, or a retired kind), 4 conflict (already decided).
 */
import { readProcessArguments } from "#cli/infrastructure/process-arguments.ts";

// The prompt hook runs before every prompt, so its route is matched here, before the command
// tree loads. Both routes are imported lazily for that reason.
const args = readProcessArguments();
if (args[0] === "hook" && args[1] === "prompt") {
  const { runTasteHookPromptRoute } = await import("#cli/routes/taste-hook-prompt.ts");
  await runTasteHookPromptRoute(args.slice(2));
}

const { runTasteCli } = await import("#cli/routes/taste-command.ts");
await runTasteCli();
