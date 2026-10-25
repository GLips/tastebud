/**
 * Who is calling and from where. Adapters build the caller from their own transport; it is never
 * read from operation input, so an agent can't claim to be a human by sending a field.
 */
import { Effect, Result } from "effect";

import { canonicalPlaceKey, type PlaceKey, type TasteContext } from "../shared/places.ts";
import { isHumanAccount } from "../shared/vocabulary.ts";
import type { PlaceContext } from "./config.ts";
import { InvalidTasteInput } from "./errors.ts";
import { resolveTasteContext } from "./place-resolution.ts";
import { TasteStore } from "./store.ts";

export interface TasteCaller {
  readonly via: "cli" | "mcp" | "review" | "hook";
  /** The agent or process acting, e.g. `claude-code/2.x`. Required by agent writes; never `human:`. */
  readonly actor?: string;
  readonly context: TasteContext;
}

/** The actor an agent write records. Any `human:` name is refused after trimming. */
export const requireAgentActor = (caller: TasteCaller, purpose: string) => {
  const actor = caller.actor?.trim();
  if (actor === undefined || actor === "")
    return Effect.fail(new InvalidTasteInput({ problems: [`${purpose} needs the acting agent's name (--by / --as)`] }));
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

/** Canonical place keys from caller input, each problem naming `field`. */
export const canonicalInputPlaces = (field: string, keys: ReadonlyArray<string>, home: string) => {
  const problems: Array<string> = [];
  const places: Array<PlaceKey> = [];
  for (const key of keys) {
    const canonical = canonicalPlaceKey(key, { home });
    if (Result.isFailure(canonical)) problems.push(`${field}: "${key}": ${canonical.failure}`);
    else places.push(canonical.success);
  }
  return problems.length > 0 ? Effect.fail(new InvalidTasteInput({ problems })) : Effect.succeed([...new Set(places)]);
};

/** The `in` / `at` fields operations accept, overriding the caller's context. */
export interface ContextOverrideInput {
  readonly in?: string;
  readonly at?: ReadonlyArray<string>;
}

/**
 * The context an operation runs in: the caller's, unless the input names `in` or `at`. Capture
 * passes `source`, so a custom resolver can place a source by who said it.
 */
export const resolveOperationContext = Effect.fn("taste.resolveOperationContext")(function* (
  input: ContextOverrideInput,
  caller: TasteCaller,
  source?: PlaceContext["source"],
) {
  const overridden = input.in !== undefined || (input.at !== undefined && input.at.length > 0);
  if (overridden) return yield* resolveTasteContext({ in: input.in, at: input.at, cwd: caller.context.cwd, source });
  const { config } = yield* TasteStore;
  // Only a custom resolver reads `source`; the built-ins would resolve the same cwd to the same places.
  if (source === undefined || config.resolver.name !== "custom" || caller.context.cwd === undefined)
    return caller.context;
  return yield* resolveTasteContext({ cwd: caller.context.cwd, source });
});
