import { Effect } from "effect";

import type { TasteCaller } from "#core/domains/taste-caller/index.ts";
import { withFreshTasteConfig } from "#core/features/record-store/index.server.ts";

import { OperationNotAllowed } from "../errors.ts";
import type { TasteError } from "./taste-error.ts";
import type { TasteOperationWireInput, TasteServices } from "./taste-operation-declaration.ts";
import { TASTE_OPERATIONS, type TasteOperationName, type TasteOperationOutput } from "./taste-operations.ts";

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

/** The operation's own text for a result, identical across the CLI and MCP. */
export const renderTasteOperationText = <N extends TasteOperationName>(
  name: N,
  output: TasteOperationOutput<N>,
): string => TASTE_OPERATION_RUNNERS[name].renderText(output);

/** The callers that may run human operations: the review server, and the seed writing as the owner. */
const HUMAN_OPERATION_CALLERS: ReadonlySet<TasteCaller["via"]> = new Set(["review", "seed"]);

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
  if (TASTE_OPERATIONS[name].audience === "human" && !HUMAN_OPERATION_CALLERS.has(caller.via))
    return yield* new OperationNotAllowed({ operation: name, via: caller.via });
  return yield* withFreshTasteConfig(TASTE_OPERATION_RUNNERS[name].decodeAndRun(input, caller));
});
