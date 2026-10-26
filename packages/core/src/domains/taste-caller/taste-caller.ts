/**
 * Who is calling and from where. Adapters build the caller from their own transport; it is never
 * read from operation input, so an agent can't claim to be a human by sending a field.
 */
import { Effect } from "effect";

import type { TasteContext } from "#core/domains/places/index.ts";
import { isHumanAccount } from "#core/domains/taste-vocabulary/index.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

export interface TasteCaller {
  /** `seed` writes the demo store, and may run human operations on the owner's behalf. */
  readonly via: "cli" | "mcp" | "review" | "hook" | "seed";
  /** The agent or process acting, e.g. `claude-code/2.x`. Required by agent writes; never `human:`. */
  readonly actor?: string;
  /** The caller's own working directory, which relative `in` and probe paths resolve against. */
  readonly cwd?: string;
  readonly context: TasteContext;
}

/** The actor an agent write records. Any `human:` name is refused after trimming. */
export const requireAgentActor = (caller: TasteCaller, purpose: string) => {
  const actor = caller.actor?.trim();
  if (actor === undefined || actor === "")
    return Effect.fail(
      new InvalidTasteInput({
        problems: [
          caller.via === "mcp"
            ? `${purpose} needs the acting agent's name: the MCP client sent none in its clientInfo`
            : `${purpose} needs the acting agent's name (--by)`,
        ],
      }),
    );
  if (isHumanAccount(actor) || /\s/.test(actor))
    return Effect.fail(
      new InvalidTasteInput({
        problems: [
          `agents act as themselves (e.g. claude-code/2.x), never "${actor}"; only the review UI writes as a human`,
        ],
      }),
    );
  return Effect.succeed(actor);
};

/** The `in` / `at` fields operations accept, overriding the caller's context. */
export interface ContextOverrideInput {
  readonly in?: string | undefined;
  readonly at?: ReadonlyArray<string> | undefined;
}

/** Whether `input` names `in` or a non-empty `at`; then the caller's own context is never resolved. */
export const hasContextOverride = (input: ContextOverrideInput) =>
  input.in !== undefined || (input.at !== undefined && input.at.length > 0);
