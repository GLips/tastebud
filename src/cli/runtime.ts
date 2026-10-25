/**
 * What every command shares: the `--json`, `--store`, `--in` and `--at` flags, opening the store,
 * building the caller, running an operation and printing its text or JSON, and turning a failure
 * into its exit code (from `describeTasteFailure`: 1 broken, 2 input, 3 refused, 4 conflict).
 */
import { resolve } from "node:path";

import { Effect, FileSystem, Layer, Option, Path, Stdio, Terminal } from "effect";
import { CliError, Flag } from "effect/cli";
import { ChildProcessSpawner } from "effect/process";

import {
  describeTasteFailure,
  provideTasteStore,
  renderTasteOperationText,
  resolveStoreRoot,
  resolveTasteContext,
  runTasteOperation,
  type TasteCaller,
  type TasteError,
  type TasteOperationName,
  type TasteOperationOutput,
  TASTE_OPERATIONS,
  type TasteStore,
} from "../core/index.ts";

export const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print the operation's result as JSON on stdout (errors too, as {error})"),
  Flag.withDefault(false),
);
export const storeFlag = Flag.optional(Flag.String("store")).pipe(
  Flag.withDescription("Store root (default: $TASTE_STORE, then ~/.taste)"),
);

export const optionalTextFlag = (name: string, description: string) =>
  Flag.optional(Flag.String(name)).pipe(Flag.withDescription(description));
export const repeatableTextFlag = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.atLeast(0), Flag.withDescription(`${description} (repeatable)`));

/** `--in` and `--at`, for commands whose operation reads where the caller is. */
export const contextFlags = {
  in: optionalTextFlag("in", "Resolve the context as if working in this directory (default: the current directory)"),
  at: repeatableTextFlag(
    "at",
    "Take this place key as the context instead of resolving a directory, e.g. github.com/acme/web::",
  ),
};

/** `--by`: the acting agent. Core refuses `human:` names; only the review UI writes as the owner. */
export const actorFlag = Flag.String("by").pipe(
  Flag.withDescription("The acting agent, as itself, e.g. claude-code/2.x (never human:…)"),
);

export const resolveCliStoreRoot = (store: Option.Option<string>): string =>
  resolveStoreRoot({ flag: Option.getOrUndefined(store), env: process.env.TASTE_STORE });

/** Runs `effect` against the store named by `--store` / `TASTE_STORE` / `~/.taste`. */
export const inCliStore = <A, E>(store: Option.Option<string>, effect: Effect.Effect<A, E, TasteStore>) =>
  provideTasteStore(resolveCliStoreRoot(store))(effect);

export const printLine = (text: string) => Effect.sync(() => process.stdout.write(`${text}\n`));
export const printErrorLine = (text: string) => Effect.sync(() => process.stderr.write(`${text}\n`));

/** One result, as pretty JSON under `--json` and as `renderText` otherwise. */
export const emitCliResult = <A>(json: boolean, value: A, renderText: (value: A) => string) =>
  printLine(json ? JSON.stringify(value, null, 2) : renderText(value));

/**
 * A text flag whose value `-` means "read stdin". Reading only on request matters: agents' shells
 * often hand over an open pipe that never closes, so an implicit read would hang.
 */
export const readTextOrStdin = (value: string) =>
  value === "-" ? Effect.promise(() => Bun.stdin.text()) : Effect.succeed(value);

/** Flags that are unset stay absent, so the operation's own defaults and messages apply. */
export const definedFields = (fields: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, Option.isOption(value) ? Option.getOrUndefined(value) : value] as const)
      .filter(([, value]) => value !== undefined && value !== false && !(Array.isArray(value) && value.length === 0)),
  );

/** Operations whose input has `in`, i.e. the ones that read where the caller is. */
const readsCallerContext = (name: TasteOperationName) => Object.hasOwn(TASTE_OPERATIONS[name].input.fields, "in");

export interface CliOperationOptions {
  readonly store: Option.Option<string>;
  readonly json: boolean;
  readonly actor?: string;
}

/**
 * The CLI's adapter: the caller is this process (its cwd, and `--by`), then the operation decodes
 * and runs `input`. Relative `--in` paths resolve against the cwd inside core.
 */
export const runCliOperation = <N extends TasteOperationName>(
  name: N,
  input: Record<string, unknown>,
  options: CliOperationOptions,
) =>
  Effect.gen(function* () {
    const cwd = process.cwd();
    const output = yield* inCliStore(
      options.store,
      Effect.gen(function* () {
        // Resolving the cwd runs git, so only operations that read the context pay for it.
        const context = readsCallerContext(name)
          ? yield* resolveTasteContext({ cwd })
          : { places: [], origin: "unknown" as const, cwd };
        const caller: TasteCaller = {
          via: "cli",
          context,
          ...(options.actor !== undefined && { actor: options.actor }),
        };
        return yield* runTasteOperation(name, input, caller);
      }),
    );
    yield* emitCliResult(options.json, output, (value: TasteOperationOutput<N>) =>
      renderTasteOperationText(name, value),
    );
    return output;
  });

/** Directories typed on the command line, absolute so core resolves them the same from anywhere. */
export const absoluteDirectories = (directories: ReadonlyArray<string>) =>
  directories.map((directory) =>
    directory === "~" || directory.startsWith("~/") ? directory : resolve(process.cwd(), directory),
  );

/**
 * effect/cli needs these services, but taste never uses its file, path-completion, prompt or
 * child-process features. `@effect/platform-bun` is not a dependency, so this is the minimum by hand.
 */
export const cliPlatformLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Stdio.layerTest({ args: Effect.sync(() => process.argv.slice(2)) }),
  Layer.succeed(
    Terminal.Terminal,
    Terminal.make({
      columns: Effect.sync(() => process.stdout.columns ?? 100),
      rows: Effect.sync(() => process.stdout.rows ?? 24),
      readInput: Effect.die("taste has no interactive prompts"),
      readLine: Effect.die("taste has no interactive prompts"),
      display: (text) => Effect.sync(() => void process.stdout.write(text)),
    }),
  ),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die("taste spawns processes with Bun.spawn")),
  ),
);

/**
 * Reports a failed command and returns its exit code. effect/cli has already printed help and parse
 * errors (exit 2, or 0 for a bare help request). A defect prints its stack and exits 1.
 */
export const reportCliFailure = (
  failure:
    | { readonly _tag: "Fail"; readonly error: TasteError | CliError.CliError }
    | { readonly _tag: "Die"; readonly defect: unknown },
  json: boolean,
): number => {
  if (failure._tag === "Die") {
    const { defect } = failure;
    process.stderr.write(`${defect instanceof Error ? (defect.stack ?? defect.message) : String(defect)}\n`);
    return 1;
  }
  const { error } = failure;
  if (CliError.isCliError(error)) return error._tag === "ShowHelp" && error.errors.length === 0 ? 0 : 2;
  const described = describeTasteFailure(error);
  if (json) {
    // The error's own fields (a near repeat's matches, a refusal's context) are what an agent retries with.
    const fields = Object.fromEntries(Object.entries(error).filter(([key]) => key !== "_tag"));
    const body = { error: { tag: error._tag, category: described.category, message: described.sentence, ...fields } };
    process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
  } else process.stderr.write(`taste: ${described.sentence}\n`);
  return described.exitCode;
};
