import { TASTEBUD_VERSION } from "@tastebud/core/taste-vocabulary";
/** The full command tree and its runner. `main.ts` loads this for everything but the prompt hook. */
import { Cause, Effect, Exit } from "effect";
import { Command } from "effect/cli";

import {
  captureCommand,
  catalogCommand,
  configCheckCommand,
  configShowCommand,
  configWriteCommand,
  hookCommand,
  initCommand,
  listCommand,
  mcpCommand,
  openCommand,
  placesCommand,
  proposeCommand,
  recallCommand,
  recallExplainCommand,
  reindexCommand,
  repointCommand,
  repointPreviewCommand,
  reportCliFailure,
  reviewUrlCommand,
  showCommand,
  threadReplyCommand,
  transcriptCandidatesCommand,
} from "#cli/features/cli-operations/index.server.ts";
import { seedCommand } from "#cli/features/demo-seed/index.server.ts";
import { reviewCommand } from "#cli/features/review-server/index.server.ts";
import { cliPlatformLayer, setProcessExitCode } from "#cli/infrastructure/cli-platform-layer.ts";
import { readProcessArguments } from "#cli/infrastructure/process-arguments.ts";

const tastebudCommand = Command.make("tastebud").pipe(
  Command.withDescription(
    "Human-ratified taste for agents: capture the owner's exact words, propose what follows from them, recall what they accepted and rejected. Start with `tastebud catalog`; to turn saved words into proposals, `tastebud catalog --guide`; with no store yet, `tastebud config-show --guide`.",
  ),
  Command.withSubcommands([
    catalogCommand,
    recallCommand,
    recallExplainCommand,
    captureCommand,
    transcriptCandidatesCommand,
    proposeCommand,
    listCommand,
    showCommand,
    threadReplyCommand,
    reviewUrlCommand,
    openCommand,
    placesCommand,
    repointCommand,
    repointPreviewCommand,
    hookCommand,
    mcpCommand,
    reviewCommand,
    configShowCommand,
    configCheckCommand,
    configWriteCommand,
    initCommand,
    seedCommand,
    reindexCommand,
  ]),
);

export const runTastebudCli = async () => {
  const exit = await Effect.runPromiseExit(
    Command.run(tastebudCommand, { version: TASTEBUD_VERSION }).pipe(Effect.provide(cliPlatformLayer)),
  );
  if (Exit.isSuccess(exit)) return;
  const failed = exit.cause.reasons.find(Cause.isFailReason);
  setProcessExitCode(
    reportCliFailure(
      failed ? { _tag: "Fail", error: failed.error } : { _tag: "Die", defect: Cause.squash(exit.cause) },
      readProcessArguments().includes("--json"),
    ),
  );
};
