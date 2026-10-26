/**
 * `taste hook prompt`, mounted ahead of the command tree: `main.ts` loads this instead of
 * `taste-command.ts` so effect/cli and the command tree stay unloaded and the hook's cold start
 * inside its budget. `--help` falls through to the full CLI, which prints the registered help.
 */
import { runTasteHookPrompt } from "#cli/features/prompt-hook/index.server.ts";

/** Runs the hook and exits, or returns for `--help` so the caller falls through to the full CLI. */
export const runTasteHookPromptRoute = async (hookArgs: ReadonlyArray<string>): Promise<void> => {
  if (hookArgs.includes("--help") || hookArgs.includes("-h")) return;
  const storeAt = hookArgs.indexOf("--store");
  const storeFlag =
    storeAt === -1
      ? hookArgs.find((arg) => arg.startsWith("--store="))?.slice("--store=".length)
      : hookArgs[storeAt + 1];
  await runTasteHookPrompt(storeFlag);
};
