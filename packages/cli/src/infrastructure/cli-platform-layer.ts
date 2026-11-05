import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect";
import { ChildProcessSpawner } from "effect/process";

import { readProcessArguments } from "./process-arguments.ts";
import { terminalColumns, terminalRows, writeStdout } from "./terminal.ts";

/**
 * effect/cli needs these services, but tastebud never uses its file, path-completion, prompt or
 * child-process features. `@effect/platform-bun` is not a dependency, so this is the minimum by hand.
 */
export const cliPlatformLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Stdio.layerTest({ args: Effect.sync(() => [...readProcessArguments()]) }),
  Layer.succeed(
    Terminal.Terminal,
    Terminal.make({
      columns: Effect.sync(terminalColumns),
      rows: Effect.sync(terminalRows),
      readInput: Effect.die("tastebud has no interactive prompts"),
      readLine: Effect.die("tastebud has no interactive prompts"),
      display: (text) => Effect.sync(() => writeStdout(text)),
    }),
  ),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die("tastebud spawns processes with Bun.spawn")),
  ),
);

/** The exit code the process ends with once the command finishes. */
export const setProcessExitCode = (code: number) => {
  process.exitCode = code;
};
