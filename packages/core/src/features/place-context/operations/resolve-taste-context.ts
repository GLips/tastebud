/**
 * Where the caller is: the configured resolver turns a directory into places, and
 * `resolveTasteContext` applies the precedence `in`, then `at`, then the cwd, then a single MCP root.
 * Failures are `PlaceResolutionFailed`, never a silent switch to another identity.
 */
import { fileURLToPath } from "node:url";

import { Effect, Result } from "effect";

import { canonicalInputPlaces } from "#core/domains/derivation-scope/index.ts";
import {
  canonicalPlaceKey,
  gitPlaceVerdictOf,
  type PlaceKey,
  type TasteContext,
  UNKNOWN_TASTE_CONTEXT,
} from "#core/domains/places/index.ts";
import type { LoadedTastebudConfig, PlaceContext } from "#core/domains/store-config/index.ts";
import { type ContextOverrideInput, hasContextOverride, type TasteCaller } from "#core/domains/taste-caller/index.ts";
import { processEnvironment } from "#core/env.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { realDirectoryOf } from "#core/infrastructure/directory-facts.ts";
import { readGitCheckoutFacts } from "#core/infrastructure/git-repository.ts";
import { realHomeDirectory } from "#core/infrastructure/home-directory.ts";
import { PlaceResolutionFailed } from "#core/infrastructure/store-errors.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

import { expandInputDirectory } from "./expand-input-directory.ts";

/** A realpath'd directory as a directory place: `~/…` under the home directory, else absolute. */
const directoryPlaceOf = (directory: string): Effect.Effect<PlaceKey, PlaceResolutionFailed> => {
  const key = canonicalPlaceKey(directory, { home: realHomeDirectory() });
  return Result.isSuccess(key)
    ? Effect.succeed(key.success)
    : Effect.fail(new PlaceResolutionFailed({ directory, problem: `it can't be a place key: ${key.failure}` }));
};

/** The `git` resolver: `normalizeRemote(origin)::<prefix>`, or the directory place when there is no hosted origin. */
const resolveGitPlaces = (directory: string) =>
  Effect.gen(function* () {
    const verdict = gitPlaceVerdictOf(yield* readGitCheckoutFacts(directory));
    if (verdict.kind === "directory") return [yield* directoryPlaceOf(directory)];
    if (verdict.kind === "unresolvable")
      return yield* new PlaceResolutionFailed({ directory, problem: verdict.problem });
    return [verdict.place];
  });

const canonicalResolvedKeys = (directory: string, returned: Result.Result<ReadonlyArray<string>, string>) => {
  if (Result.isFailure(returned))
    return Effect.fail(new PlaceResolutionFailed({ directory, problem: returned.failure }));
  const keys: Array<PlaceKey> = [];
  for (const value of returned.success) {
    const key = canonicalPlaceKey(value, { home: realHomeDirectory() });
    if (Result.isFailure(key))
      return Effect.fail(
        new PlaceResolutionFailed({
          directory,
          problem: `the place function returned ${JSON.stringify(value)}: ${key.failure}`,
        }),
      );
    keys.push(key.success);
  }
  return Effect.succeed([...new Set(keys)]);
};

/** The configured resolver applied to one directory. `source` is passed at capture time only. */
export const resolvePlacesForDirectory = Effect.fn("place-context.resolvePlacesForDirectory")(function* (
  config: LoadedTastebudConfig,
  directory: string,
  source?: PlaceContext["source"],
) {
  const real = yield* realDirectoryOf(directory);
  const resolver = config.resolver;
  if (resolver.name === "git") return yield* resolveGitPlaces(real);
  if (resolver.name === "directories") return [yield* directoryPlaceOf(real)];
  const returned = yield* Effect.tryPromise({
    try: () => resolver.resolvePlaces({ cwd: real, ...(source && { source }), env: processEnvironment() }),
    catch: (error) =>
      new PlaceResolutionFailed({ directory: real, problem: `the place function threw: ${String(error)}` }),
  });
  return yield* canonicalResolvedKeys(real, returned);
});

/** What a shell knows about where its caller is. `in` and `at` are mutually exclusive. */
export interface TasteContextRequest {
  /** A directory to resolve, as if the caller were there (`--in`). Relative paths need `cwd`. */
  readonly in?: string | undefined;
  /** Places taken as given (`--at`, repeatable): where the caller is, never where a proposal applies. */
  readonly at?: ReadonlyArray<string> | undefined;
  /** The CLI's `process.cwd()`, or the hook's JSON `cwd`. MCP never passes its own process cwd. */
  readonly cwd?: string | undefined;
  /** The MCP client's roots. Exactly one `file://` root becomes the cwd. */
  readonly mcpRoots?: ReadonlyArray<string> | undefined;
  readonly source?: PlaceContext["source"];
}

/** Context origins that come from resolving a directory, so a re-resolution keeps them. */
export type DirectoryContextOrigin = "in" | "cwd" | "mcp-root";

/** A directory's context under `origin`; no places means unknown context. */
export const contextFromDirectory = Effect.fn("place-context.contextFromDirectory")(function* (
  config: LoadedTastebudConfig,
  directory: string,
  origin: DirectoryContextOrigin,
  source: PlaceContext["source"],
) {
  const places = yield* resolvePlacesForDirectory(config, directory, source);
  const context: TasteContext =
    places.length === 0 ? { places, origin: "unknown", cwd: directory } : { places, origin, cwd: directory };
  return context;
});

/** The one place the context precedence is applied. Every shell and operation goes through it. */
export const resolveTasteContext = Effect.fn("place-context.resolveTasteContext")(function* (
  request: TasteContextRequest,
) {
  const { config } = yield* TasteStore;
  const at = request.at ?? [];
  if (request.in !== undefined && at.length > 0)
    return yield* new InvalidTasteInput({ problems: ["in and at are mutually exclusive"] });
  if (request.in !== undefined) {
    const directory = yield* expandInputDirectory("in", request.in, request.cwd);
    return yield* contextFromDirectory(config, directory, "in", request.source);
  }
  if (at.length > 0) {
    const places = yield* canonicalInputPlaces("at", at, realHomeDirectory());
    const context: TasteContext = { places, origin: "at", ...(request.cwd !== undefined && { cwd: request.cwd }) };
    return context;
  }
  if (request.cwd !== undefined) return yield* contextFromDirectory(config, request.cwd, "cwd", request.source);
  const fileRoots = (request.mcpRoots ?? []).filter((root) => root.startsWith("file://"));
  const [onlyRoot, ...otherRoots] = fileRoots;
  if (onlyRoot !== undefined && otherRoots.length === 0)
    return yield* contextFromDirectory(config, fileURLToPath(onlyRoot), "mcp-root", request.source);
  return UNKNOWN_TASTE_CONTEXT;
});

/**
 * The context an operation runs in: the caller's, unless the input names `in` or `at`. Capture
 * passes `source`, so a custom resolver can place a source by who said it. That re-resolution
 * applies only to directory-derived contexts; an explicit `at` is the caller's word and is kept.
 */
export const resolveOperationContext = Effect.fn("place-context.resolveOperationContext")(function* (
  input: ContextOverrideInput,
  caller: TasteCaller,
  source?: PlaceContext["source"],
) {
  if (hasContextOverride(input))
    return yield* resolveTasteContext({ in: input.in, at: input.at, cwd: caller.cwd, source });
  const { config } = yield* TasteStore;
  const { context } = caller;
  // Only a custom resolver reads `source`; the built-ins would resolve the same cwd to the same places.
  if (source === undefined || config.resolver.name !== "custom" || context.cwd === undefined) return context;
  if (context.origin === "at") return context;
  // An unknown context with a cwd is a directory that resolved to nothing without the source.
  const origin = context.origin === "unknown" ? "cwd" : context.origin;
  return yield* contextFromDirectory(config, context.cwd, origin, source);
});
