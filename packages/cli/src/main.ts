#!/usr/bin/env bun
/**
 * `tastebud`: the CLI. Exit codes: 0 ok, 1 broken (a bug or a corrupt store), 2 invalid input,
 * 3 refused (a near repeat to name with --despite, or a retired kind), 4 conflict (already decided).
 */
import { readProcessArguments } from "#cli/infrastructure/process-arguments.ts";

// The prompt hook runs before every prompt, so its route is matched here, before the command
// tree loads. Both routes are imported lazily for that reason.
const args = readProcessArguments();
if (args[0] === "hook" && args[1] === "prompt") {
  const { runTastebudHookPromptRoute } = await import("#cli/routes/tastebud-hook-prompt.ts");
  await runTastebudHookPromptRoute(args.slice(2));
}

const { runTastebudCli } = await import("#cli/routes/tastebud-command.ts");
await runTastebudCli();
