/** The full command tree and its runner. `main.ts` loads this for everything but the prompt hook. */
import { Cause, Effect, Exit } from "effect";
import { Command } from "effect/cli";

import {
  captureCommand,
  catalogCommand,
  contextCommand,
  decideCommand,
  hookCommand,
  hookPreviewCommand,
  initCommand,
  listCommand,
  mcpCommand,
  placesCommand,
  proposeCommand,
  recallCommand,
  recallExplainCommand,
  reindexCommand,
  repointCommand,
  repointPreviewCommand,
  reviewUrlCommand,
  showCommand,
  threadReplyCommand,
} from "./commands.ts";
import { reviewCommand } from "./review.ts";
import { cliPlatformLayer, reportCliFailure } from "./runtime.ts";
import { seedCommand } from "./seed.ts";

const tasteCommand = Command.make("taste").pipe(
  Command.withDescription(
    "Human-ratified taste for agents: capture the owner's exact words, propose what follows from them, recall what they accepted and rejected. Start with `taste catalog`.",
  ),
  Command.withSubcommands([
    catalogCommand,
    recallCommand,
    recallExplainCommand,
    contextCommand,
    captureCommand,
    proposeCommand,
    listCommand,
    showCommand,
    threadReplyCommand,
    reviewUrlCommand,
    decideCommand,
    placesCommand,
    repointCommand,
    repointPreviewCommand,
    hookPreviewCommand,
    hookCommand,
    mcpCommand,
    reviewCommand,
    initCommand,
    seedCommand,
    reindexCommand,
  ]),
);

export const runTasteCli = async () => {
  const exit = await Effect.runPromiseExit(
    Command.run(tasteCommand, { version: "0.1.0" }).pipe(Effect.provide(cliPlatformLayer)),
  );
  if (Exit.isSuccess(exit)) return;
  const failed = exit.cause.reasons.find(Cause.isFailReason);
  process.exitCode = reportCliFailure(
    failed ? { _tag: "Fail", error: failed.error } : { _tag: "Die", defect: Cause.squash(exit.cause) },
    process.argv.includes("--json"),
  );
};
