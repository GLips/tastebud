import { Effect } from "effect";

import { UNKNOWN_TASTE_CONTEXT } from "#core/domains/places/index.ts";
import { hasContextOverride, type TasteCaller } from "#core/domains/taste-caller/index.ts";
import { resolveTasteContext } from "#core/features/place-context/index.server.ts";

import type { TasteOperationWireInput } from "./taste-operation-declaration.ts";
import { TASTE_OPERATIONS, type TasteOperationName } from "./taste-operations.ts";

/** What a shell knows about its caller before reading the input. */
export interface TasteCallerOrigin {
  readonly via: TasteCaller["via"];
  readonly actor?: string | undefined;
  /** The process's own directory: the CLI's cwd. MCP and the review server have none worth trusting. */
  readonly cwd?: string | undefined;
  /** The MCP client's roots, listed only when the context must come from them. */
  readonly roots?: Effect.Effect<ReadonlyArray<string>> | undefined;
}

const contextOverrideOf = (input: TasteOperationWireInput): { in?: string; at?: ReadonlyArray<string> } => {
  const directory = input["in"];
  const places = input["at"];
  return {
    // Blank values decode to absent, so they must not count as an override here either.
    ...(typeof directory === "string" && directory.trim() !== "" && { in: directory }),
    ...(Array.isArray(places) && {
      at: places.filter((place): place is string => typeof place === "string" && place.trim() !== ""),
    }),
  };
};

/** Where the shell's caller is, from its cwd, else its single MCP root; neither is unknown context. */
const contextOfCallerOrigin = Effect.fn("operation-registry.contextOfCallerOrigin")(function* (
  origin: TasteCallerOrigin,
) {
  if (origin.cwd !== undefined) return yield* resolveTasteContext({ cwd: origin.cwd });
  if (origin.roots !== undefined) return yield* resolveTasteContext({ mcpRoots: yield* origin.roots });
  return UNKNOWN_TASTE_CONTEXT;
});

/**
 * The caller every shell builds before `runTasteOperation(name, input, caller)`. Only operations that
 * read the context resolve one, and an explicit `in` / `at` in the input wins before the cwd or roots
 * are touched, so a cwd the resolver can't read never fails a call that said where it is.
 */
export const buildTasteOperationCaller = Effect.fn("operation-registry.buildTasteOperationCaller")(function* (
  name: TasteOperationName,
  origin: TasteCallerOrigin,
  input: TasteOperationWireInput,
) {
  const needsContext = TASTE_OPERATIONS[name].readsContext && !hasContextOverride(contextOverrideOf(input));
  return tasteCallerOf(origin, needsContext ? yield* contextOfCallerOrigin(origin) : UNKNOWN_TASTE_CONTEXT);
});

/** The caller from its origin and a context already settled. */
export const tasteCallerOf = (origin: TasteCallerOrigin, context: TasteCaller["context"]): TasteCaller => ({
  via: origin.via,
  context,
  ...(origin.actor !== undefined && { actor: origin.actor }),
  ...(origin.cwd !== undefined && { cwd: origin.cwd }),
});
