/**
 * Running an operation for the CLI: core opens the store (or, for the config operations, only
 * locates it), builds the caller from this process, and runs; this prints its text or JSON.
 * Failures become exit codes in `report-cli-failure`.
 */
import { Effect, Option } from "effect";
import { Command } from "effect/cli";

import { processCurrentDirectory } from "#cli/infrastructure/process-arguments.ts";
import {
  provideTasteStore,
  renderTasteOperationText,
  resolveTasteStoreRoot,
  runTasteOperationAtStoreRoot,
  TASTE_OPERATIONS,
  type TasteOperationName,
  type TasteOperationOutput,
  type TasteOperationWireInput,
  type TasteStore,
} from "#cli/infrastructure/tastebud-core.ts";
import { printLine, readStdinText } from "#cli/infrastructure/terminal.ts";

/** A command's help line, taken from the operation it runs. */
export const describedAs = (name: TasteOperationName) => Command.withDescription(TASTE_OPERATIONS[name].description);

export const resolveCliStoreRoot = (store: Option.Option<string>): string =>
  resolveTasteStoreRoot(Option.getOrUndefined(store));

/** Runs `effect` against the store named by `--store` / `TASTEBUD_STORE` / `~/.tastebud`. */
export const inCliStore = Effect.fn("cli-operations.inCliStore")(function* <A, E>(
  store: Option.Option<string>,
  effect: Effect.Effect<A, E, TasteStore>,
) {
  return yield* provideTasteStore(resolveCliStoreRoot(store))(effect);
});

/** One result, as pretty JSON under `--json` and as `renderText` otherwise. */
export const emitCliResult = Effect.fn("cli-operations.emitCliResult")(function* <A>(
  json: boolean,
  value: A,
  renderText: (value: A) => string,
) {
  yield* printLine(json ? JSON.stringify(value, null, 2) : renderText(value));
});

/**
 * A text flag whose value `-` means "read stdin". Reading only on request matters: agents' shells
 * often hand over an open pipe that never closes, so an implicit read would hang.
 */
export const readTextOrStdin = Effect.fn("cli-operations.readTextOrStdin")(function* (value: string) {
  return value === "-" ? yield* Effect.promise(readStdinText) : value;
});

export interface CliOperationOptions {
  readonly store: Option.Option<string>;
  readonly json: boolean;
  readonly actor?: string;
}

/**
 * The CLI's adapter: the caller is this process (its cwd, and `--by`), then the operation decodes
 * and runs `input`. Relative `--in` and `--probe` paths resolve against the cwd inside core.
 */
export const runCliOperation = Effect.fn("cli-operations.runCliOperation")(function* <N extends TasteOperationName>(
  name: N,
  input: TasteOperationWireInput,
  options: CliOperationOptions,
) {
  const origin = { via: "cli" as const, actor: options.actor, cwd: processCurrentDirectory() };
  const output = yield* runTasteOperationAtStoreRoot(resolveCliStoreRoot(options.store), name, input, origin);
  yield* emitCliResult(options.json, output, (value: TasteOperationOutput<N>) => renderTasteOperationText(name, value));
  return output;
});
