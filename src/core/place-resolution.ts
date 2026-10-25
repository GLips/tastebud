/**
 * Where the caller is: the configured resolver turns a directory into places, and
 * `resolveTasteContext` applies the precedence `in`, then `at`, then the cwd, then a single MCP root.
 * Failures are `PlaceResolutionFailed`, never a silent switch to another identity.
 */
import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, Result } from "effect";

import {
  canonicalPlaceKey,
  type PlaceKey,
  REPO_PLACE_SEPARATOR,
  type TasteContext,
  UNKNOWN_TASTE_CONTEXT,
} from "../shared/places.ts";
import type { LoadedTasteConfig, PlaceContext } from "./config.ts";
import { InvalidTasteInput, PlaceResolutionFailed } from "./errors.ts";
import { TasteStore } from "./store.ts";

/** Each git call gets this long. Two run in parallel, well inside the hook's 650 ms. */
const GIT_TIMEOUT_MS = 300;

export type RemoteIdentity =
  | { readonly kind: "hosted"; readonly repoId: string }
  | { readonly kind: "local" }
  | { readonly kind: "malformed"; readonly problem: string };

const repoIdFrom = (host: string, port: string, path: string): RemoteIdentity => {
  const segments = path
    .replace(/\.git\/*$/, "")
    .split("/")
    .filter((segment) => segment !== "");
  if (host === "" || segments.length === 0) return { kind: "malformed", problem: "it names no host and path" };
  return { kind: "hosted", repoId: [`${host.toLowerCase()}${port === "" ? "" : `:${port}`}`, ...segments].join("/") };
};

const REMOTE_SCHEMES = new Set(["ssh", "git", "http", "https", "git+ssh", "ssh+git"]);

/**
 * `[user[:password]@]host[:port]`, parsed by hand: WHATWG `URL` drops a port equal to the scheme's
 * default, and an explicit port is kept verbatim so `host:443` and `host` stay distinct servers.
 */
const parseRemoteAuthority = (authority: string): { host: string; port: string } | undefined => {
  const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
  const match = /^(\[[^\]]*\]|[^:[\]]*)(?::(\d*))?$/.exec(hostPort);
  return match === null ? undefined : { host: match[1] ?? "", port: match[2] ?? "" };
};

const decodeRemotePath = (path: string): string | undefined => {
  try {
    return decodeURIComponent(path);
  } catch {
    return undefined;
  }
};

/**
 * A remote URL as a repo id: no scheme, user, password or `.git`, host lowercased, explicit port
 * kept (dropping it could merge distinct servers). Local paths and `file://` are `local`.
 */
export const normalizeRemote = (url: string): RemoteIdentity => {
  const trimmed = url.trim();
  if (trimmed === "") return { kind: "malformed", problem: "the origin URL is empty" };
  if (trimmed.startsWith("file://") || /^(\/|\.{1,2}\/|~)/.test(trimmed) || !/[:]/.test(trimmed))
    return { kind: "local" };
  const schemeUrl = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/i.exec(trimmed);
  if (schemeUrl !== null) {
    const scheme = (schemeUrl[1] ?? "").toLowerCase();
    if (!REMOTE_SCHEMES.has(scheme)) return { kind: "malformed", problem: `unsupported scheme ${scheme}:` };
    const authority = parseRemoteAuthority(schemeUrl[2] ?? "");
    if (authority === undefined) return { kind: "malformed", problem: `"${trimmed}" has an unreadable host or port` };
    const path = decodeRemotePath(schemeUrl[3] ?? "");
    if (path === undefined) return { kind: "malformed", problem: `"${trimmed}" has a malformed %-escape` };
    return repoIdFrom(authority.host, authority.port, path);
  }
  // scp-like: [user@]host:path
  const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(trimmed);
  if (scp === null) return { kind: "malformed", problem: `"${trimmed}" is not a remote URL git understands` };
  return repoIdFrom(scp[1] ?? "", "", scp[2] ?? "");
};

const realHome = (): string => {
  const home = homedir();
  try {
    return realpathSync(home);
  } catch {
    return home;
  }
};

/** A realpath'd directory as a directory place: `~/…` under the home directory, else absolute. */
const directoryPlaceOf = (directory: string): Effect.Effect<PlaceKey, PlaceResolutionFailed> => {
  const key = canonicalPlaceKey(directory, { home: realHome() });
  return Result.isSuccess(key)
    ? Effect.succeed(key.success)
    : Effect.fail(new PlaceResolutionFailed({ directory, problem: `it can't be a place key: ${key.failure}` }));
};

const realDirectory = (directory: string) =>
  Effect.try({
    try: () => {
      const real = realpathSync(directory);
      if (!statSync(real).isDirectory()) throw new Error("not a directory");
      return real;
    },
    catch: (error) =>
      new PlaceResolutionFailed({ directory, problem: `it is not a readable directory (${String(error)})` }),
  });

interface GitOutput {
  readonly exitCode: number;
  readonly stdout: string;
}

/**
 * The environment minus git's repository overrides (`GIT_DIR`, `GIT_INDEX_FILE`, …). A git hook sets
 * them, and they would win over `-C directory`, resolving every directory to the hook's repo.
 */
const environmentWithoutGitRepoOverrides = (): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));

const runGit = (directory: string, args: ReadonlyArray<string>) =>
  Effect.tryPromise({
    try: async (): Promise<GitOutput> => {
      const child = Bun.spawn(["git", "-C", directory, ...args], {
        env: environmentWithoutGitRepoOverrides(),
        stdout: "pipe",
        stderr: "ignore",
        stdin: "ignore",
        timeout: GIT_TIMEOUT_MS,
      });
      const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
      if (child.signalCode !== null) throw new Error(`git ${args[0] ?? ""} timed out after ${GIT_TIMEOUT_MS} ms`);
      return { exitCode, stdout: stdout.trim() };
    },
    catch: (error) => new PlaceResolutionFailed({ directory, problem: String(error) }),
  });

/** The `git` resolver: `normalizeRemote(origin)::<prefix>`, or the directory place when there is no hosted origin. */
const resolveGitPlaces = (directory: string) =>
  Effect.gen(function* () {
    const [prefix, origin] = yield* Effect.all(
      [runGit(directory, ["rev-parse", "--show-prefix"]), runGit(directory, ["config", "--get", "remote.origin.url"])],
      { concurrency: "unbounded" },
    );
    if (prefix.exitCode !== 0 || origin.exitCode !== 0) return [yield* directoryPlaceOf(directory)];
    const remote = normalizeRemote(origin.stdout);
    if (remote.kind === "local") return [yield* directoryPlaceOf(directory)];
    if (remote.kind === "malformed")
      return yield* new PlaceResolutionFailed({ directory, problem: `origin is malformed: ${remote.problem}` });
    const key = canonicalPlaceKey(`${remote.repoId}${REPO_PLACE_SEPARATOR}${prefix.stdout}`);
    if (Result.isFailure(key))
      return yield* new PlaceResolutionFailed({ directory, problem: `origin gives no valid place: ${key.failure}` });
    return [key.success];
  });

const canonicalResolvedKeys = (directory: string, returned: unknown) => {
  if (!Array.isArray(returned))
    return Effect.fail(new PlaceResolutionFailed({ directory, problem: "the place function must return an array" }));
  const keys: Array<PlaceKey> = [];
  for (const value of returned) {
    const key =
      typeof value === "string" ? canonicalPlaceKey(value, { home: realHome() }) : Result.fail("not a string");
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
export const resolvePlacesForDirectory = Effect.fn("taste.resolvePlacesForDirectory")(function* (
  config: LoadedTasteConfig,
  directory: string,
  source?: PlaceContext["source"],
) {
  const real = yield* realDirectory(directory);
  const resolver = config.resolver;
  if (resolver.name === "git") return yield* resolveGitPlaces(real);
  if (resolver.name === "directories") return [yield* directoryPlaceOf(real)];
  const returned = yield* Effect.tryPromise({
    try: () => resolver.resolvePlaces({ cwd: real, ...(source && { source }), env: process.env }),
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

/** A directory from input, absolute: `~/…` under home, a relative path only against the caller's cwd. */
export const expandInputDirectory = (field: string, directory: string, cwd: string | undefined) => {
  if (directory === "~" || directory.startsWith("~/")) return Effect.succeed(join(homedir(), directory.slice(1)));
  if (isAbsolute(directory)) return Effect.succeed(directory);
  if (cwd === undefined)
    return Effect.fail(
      new InvalidTasteInput({ problems: [`${field}: "${directory}" is relative, and this caller has no cwd`] }),
    );
  return Effect.succeed(resolve(cwd, directory));
};

/** Context origins that come from resolving a directory, so a re-resolution keeps them. */
export type DirectoryContextOrigin = "in" | "cwd" | "mcp-root";

/** A directory's context under `origin`; no places means unknown context. */
export const contextFromDirectory = (
  config: LoadedTasteConfig,
  directory: string,
  origin: DirectoryContextOrigin,
  source: PlaceContext["source"],
) =>
  Effect.map(resolvePlacesForDirectory(config, directory, source), (places): TasteContext =>
    places.length === 0 ? { places, origin: "unknown", cwd: directory } : { places, origin, cwd: directory },
  );

const canonicalAtPlaces = (at: ReadonlyArray<string>) => {
  const problems: Array<string> = [];
  const places: Array<PlaceKey> = [];
  for (const key of at) {
    const canonical = canonicalPlaceKey(key, { home: realHome() });
    if (Result.isFailure(canonical)) problems.push(`at: "${key}": ${canonical.failure}`);
    else places.push(canonical.success);
  }
  return problems.length > 0 ? Effect.fail(new InvalidTasteInput({ problems })) : Effect.succeed([...new Set(places)]);
};

/** The one place the context precedence is applied. Every shell and operation goes through it. */
export const resolveTasteContext = Effect.fn("taste.resolveTasteContext")(function* (request: TasteContextRequest) {
  const { config } = yield* TasteStore;
  const at = request.at ?? [];
  if (request.in !== undefined && at.length > 0)
    return yield* new InvalidTasteInput({ problems: ["in and at are mutually exclusive"] });
  if (request.in !== undefined) {
    const directory = yield* expandInputDirectory("in", request.in, request.cwd);
    return yield* contextFromDirectory(config, directory, "in", request.source);
  }
  if (at.length > 0) {
    const places = yield* canonicalAtPlaces(at);
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
