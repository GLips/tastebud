import { Effect } from "effect";

import { UNKNOWN_TASTE_CONTEXT } from "#core/domains/places/index.ts";
import type { TasteCaller } from "#core/domains/taste-caller/index.ts";
import {
  provideTasteStore,
  provideTasteStoreRoot,
  type TasteStoreRoot,
  withFreshTasteConfig,
} from "#core/features/record-store/index.server.ts";

import { OperationNotAllowed } from "../errors.ts";
import { buildTasteOperationCaller, type TasteCallerOrigin, tasteCallerOf } from "./build-operation-caller.ts";
import { STORE_ROOT_TASTE_OPERATIONS } from "./store-root-operations.ts";
import type { TasteError } from "./taste-error.ts";
import type { TasteOperationWireInput, TasteServices } from "./taste-operation-declaration.ts";
import {
  isStoreRootTasteOperation,
  type StoreRootTasteOperationName,
  TASTE_OPERATIONS,
  type TasteOperationName,
  type TasteOperationOutput,
} from "./taste-operations.ts";

/**
 * The registry seen per name. Indexing this mapped type with a generic name resolves to that name's
 * own signatures, which is what lets dispatch keep each operation's types without a cast.
 */
type TasteOperationRunners = {
  readonly [N in TasteOperationName]: {
    readonly decodeAndRun: (
      input: TasteOperationWireInput,
      caller: TasteCaller,
    ) => Effect.Effect<TasteOperationOutput<N>, TasteError, TasteServices>;
    readonly renderText: (output: TasteOperationOutput<N>) => string;
  };
};
const TASTE_OPERATION_RUNNERS: TasteOperationRunners = TASTE_OPERATIONS;

/** The config operations seen per name: this assignment fails to compile if one needs an open store. */
type StoreRootOperationRunners = {
  readonly [N in StoreRootTasteOperationName]: {
    readonly decodeAndRun: (
      input: TasteOperationWireInput,
      caller: TasteCaller,
    ) => Effect.Effect<TasteOperationOutput<N>, TasteError, TasteStoreRoot>;
  };
};
const STORE_ROOT_OPERATION_RUNNERS: StoreRootOperationRunners = STORE_ROOT_TASTE_OPERATIONS;

const runStoreRootOperation = <N extends StoreRootTasteOperationName>(
  root: string,
  name: N,
  input: TasteOperationWireInput,
  caller: TasteCaller,
): Effect.Effect<TasteOperationOutput<N>, TasteError> =>
  provideTasteStoreRoot(root)(STORE_ROOT_OPERATION_RUNNERS[name].decodeAndRun(input, caller));

/** The operation's own text for a result, identical across the CLI and MCP. */
export const renderTasteOperationText = <N extends TasteOperationName>(
  name: N,
  output: TasteOperationOutput<N>,
): string => TASTE_OPERATION_RUNNERS[name].renderText(output);

/** The callers that may run human operations: the review server, and the seed writing as the owner. */
const HUMAN_OPERATION_CALLERS: ReadonlySet<TasteCaller["via"]> = new Set(["review", "seed"]);

const requireOperationAllowed = (name: TasteOperationName, caller: TasteCaller) =>
  TASTE_OPERATIONS[name].audience === "human" && !HUMAN_OPERATION_CALLERS.has(caller.via)
    ? Effect.fail(new OperationNotAllowed({ operation: name, via: caller.via }))
    : Effect.void;

/**
 * Decodes `input` with the operation's schema (every issue, no excess fields), then runs it against a
 * freshly read config. Human operations run only for `via: "review"` or `"seed"`.
 */
export const runTasteOperation = Effect.fn("operation-registry.runTasteOperation")(function* <
  N extends TasteOperationName,
>(
  name: N,
  input: TasteOperationWireInput,
  caller: TasteCaller,
): Effect.fn.Return<TasteOperationOutput<N>, TasteError, TasteServices> {
  yield* requireOperationAllowed(name, caller);
  const run = TASTE_OPERATION_RUNNERS[name].decodeAndRun(input, caller);
  // The config operations read the file themselves; an open store's config is only the last good load.
  return yield* isStoreRootTasteOperation(name) ? run : withFreshTasteConfig(run);
});

/**
 * What the CLI and MCP run per call: the store at `root` opened, the caller built, the operation run.
 * The config operations get only the root, so they work where no store exists yet.
 */
export const runTasteOperationAtStoreRoot = Effect.fn("operation-registry.runTasteOperationAtStoreRoot")(function* <
  N extends TasteOperationName,
>(
  root: string,
  name: N,
  input: TasteOperationWireInput,
  origin: TasteCallerOrigin,
): Effect.fn.Return<TasteOperationOutput<N>, TasteError> {
  if (isStoreRootTasteOperation(name)) {
    // No config operation reads where the caller is, so its context is never resolved.
    return yield* runStoreRootOperation(root, name, input, tasteCallerOf(origin, UNKNOWN_TASTE_CONTEXT));
  }
  return yield* provideTasteStore(root)(
    Effect.flatMap(buildTasteOperationCaller(name, origin, input), (caller) => runTasteOperation(name, input, caller)),
  );
});
