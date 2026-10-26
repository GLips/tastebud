/**
 * The `git` resolver's pure half: an origin URL as a repo id, and the repo place it gives a
 * subdirectory. Running git lives in infrastructure; this only reads what git printed.
 */
import { Result } from "effect";

import { canonicalPlaceKey, type PlaceKey, REPO_PLACE_SEPARATOR } from "./place-keys.ts";

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

/** What git said about a directory: its path inside the checkout and its origin, when it has both. */
export interface GitCheckoutFacts {
  readonly prefix: string;
  readonly originUrl: string;
}

/** The `git` resolver's verdict for a directory: a repo place, the directory itself, or a reason it can't say. */
export type GitPlaceVerdict =
  | { readonly kind: "repo"; readonly place: PlaceKey }
  | { readonly kind: "directory" }
  | { readonly kind: "unresolvable"; readonly problem: string };

/** `normalizeRemote(origin)::<prefix>`; outside a checkout, or with a local origin, the directory place. */
export const gitPlaceVerdictOf = (facts: GitCheckoutFacts | undefined): GitPlaceVerdict => {
  if (facts === undefined) return { kind: "directory" };
  const remote = normalizeRemote(facts.originUrl);
  if (remote.kind === "local") return { kind: "directory" };
  if (remote.kind === "malformed") return { kind: "unresolvable", problem: `origin is malformed: ${remote.problem}` };
  const key = canonicalPlaceKey(`${remote.repoId}${REPO_PLACE_SEPARATOR}${facts.prefix}`);
  return Result.isFailure(key)
    ? { kind: "unresolvable", problem: `origin gives no valid place: ${key.failure}` }
    : { kind: "repo", place: key.success };
};
