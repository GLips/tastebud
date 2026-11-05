import { Match } from "effect";
import { CliError } from "effect/cli";

import { describeTasteFailure, type TasteError } from "#cli/infrastructure/tastebud-core.ts";
import { writeStderr, writeStdout } from "#cli/infrastructure/terminal.ts";

/** How a command ended badly: a typed failure, or a defect (a bug in Tastebud). */
export type CliFailure =
  | { readonly _tag: "Fail"; readonly error: TasteError | CliError.CliError }
  | { readonly _tag: "Die"; readonly defect: unknown };

/** effect/cli has already printed help and parse errors: exit 2, or 0 for a bare help request. */
const cliErrorExitCode = (error: CliError.CliError) =>
  Match.value(error).pipe(
    Match.tag("ShowHelp", (help) => (help.errors.length === 0 ? 0 : 2)),
    Match.orElse(() => 2),
  );

const reportTasteError = (error: TasteError, json: boolean) => {
  const { envelope, exitCode } = describeTasteFailure(error, "cli");
  if (json) writeStdout(`${JSON.stringify({ error: envelope }, null, 2)}\n`);
  else writeStderr(`tastebud: ${envelope.sentence}\n`);
  return exitCode;
};

/** Reports a failed command and returns its exit code. A defect prints its stack and exits 1. */
export const reportCliFailure = (failure: CliFailure, json: boolean): number =>
  Match.value(failure).pipe(
    Match.tagsExhaustive({
      Die: ({ defect }) => {
        writeStderr(`${defect instanceof Error ? (defect.stack ?? defect.message) : String(defect)}\n`);
        return 1;
      },
      Fail: ({ error }) => (CliError.isCliError(error) ? cliErrorExitCode(error) : reportTasteError(error, json)),
    }),
  );
