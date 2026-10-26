/**
 * Place keys, as pure browser-safe code: the UI matches and labels places with the same rules core
 * uses. A key is a repo place (`github.com/x/y::sub/dir`), a directory place (`~/…` or `/…`) or a
 * named place (`clients/acme`). Resolving a cwd to places needs git and the filesystem, so that
 * half lives in the place-context feature.
 */
import { Result } from "effect";

export type PlaceKey = string;

export type ParsedPlace =
  | { readonly form: "repo"; readonly repoId: string; readonly segments: ReadonlyArray<string> }
  | { readonly form: "directory"; readonly root: "~" | "/"; readonly segments: ReadonlyArray<string> }
  | { readonly form: "named"; readonly segments: ReadonlyArray<string> };

/** Marks where repo identity ends, so `gitlab.com/a/b/c` can't be read as a subdirectory. */
export const REPO_PLACE_SEPARATOR = "::";

const splitSegments = (path: string): Array<string> => path.split("/").filter((segment) => segment !== "");

const segmentProblem = (segments: ReadonlyArray<string>): string | undefined =>
  segments.some((segment) => segment === "." || segment === "..") ? "no . or .. segments" : undefined;

const parseRepoId = (raw: string): Result.Result<string, string> => {
  if (raw.includes("://") || raw.includes("@"))
    return Result.fail("a repo id has no scheme or user, e.g. github.com/owner/repo::");
  const [host, ...path] = splitSegments(raw.replace(/\.git\/*$/, ""));
  if (host === undefined) return Result.fail("a repo place needs a repo id before ::");
  const problem = segmentProblem(path);
  if (problem !== undefined) return Result.fail(problem);
  return Result.succeed([host.toLowerCase(), ...path].join("/"));
};

/** Validates a key and splits it into its form, root and segments. The failure is a short reason. */
/** The root a directory key hangs from: `~` for home-relative, `/` for absolute, else not a directory. */
const directoryRootOf = (key: string): "~" | "/" | undefined => {
  if (key === "~" || key.startsWith("~/")) return "~";
  if (key.startsWith("/")) return "/";
  return undefined;
};

export const parsePlaceKey = (key: string): Result.Result<ParsedPlace, string> => {
  if (key === "") return Result.fail("a place key can't be empty");
  if (key.trim() !== key) return Result.fail("a place key can't start or end with whitespace");
  if (key.includes("\\")) return Result.fail("a place key uses / and never \\");
  const separator = key.indexOf(REPO_PLACE_SEPARATOR);
  if (separator !== -1) {
    const subpath = key.slice(separator + REPO_PLACE_SEPARATOR.length);
    if (subpath.includes(REPO_PLACE_SEPARATOR)) return Result.fail(":: may appear once, after the repo id");
    const segments = splitSegments(subpath);
    const problem = segmentProblem(segments);
    if (problem !== undefined) return Result.fail(problem);
    return Result.map(parseRepoId(key.slice(0, separator)), (repoId) => ({ form: "repo", repoId, segments }));
  }
  const directoryRoot = directoryRootOf(key);
  if (key.startsWith("~") && directoryRoot === undefined)
    return Result.fail("~ must stand alone or start ~/ (no ~user forms)");
  const segments = splitSegments(directoryRoot === "~" ? key.slice(1) : key);
  const problem = segmentProblem(segments);
  if (problem !== undefined) return Result.fail(problem);
  if (directoryRoot !== undefined) return Result.succeed({ form: "directory", root: directoryRoot, segments });
  if (segments.length === 0) return Result.fail("a named place needs at least one segment");
  return Result.succeed({ form: "named", segments });
};

/** The one spelling of a parsed place. Directory places under `home` (when given) become `~/…`. */
const formatParsedPlace = (place: ParsedPlace, home?: string): PlaceKey => {
  switch (place.form) {
    case "repo":
      return `${place.repoId}${REPO_PLACE_SEPARATOR}${place.segments.join("/")}`;
    case "named":
      return place.segments.join("/");
    case "directory": {
      const homeSegments = home === undefined ? undefined : splitSegments(home);
      const underHome =
        place.root === "/" &&
        homeSegments !== undefined &&
        homeSegments.length > 0 &&
        homeSegments.every((segment, index) => place.segments[index] === segment);
      const segments = underHome ? place.segments.slice(homeSegments.length) : place.segments;
      const root = underHome ? "~" : place.root;
      if (segments.length === 0) return root;
      return root === "~" ? `~/${segments.join("/")}` : `/${segments.join("/")}`;
    }
  }
};

/** Validates and canonicalises a key: lowercased host, no `.git`, no stray slashes, `~/…` under `home`. */
export const canonicalPlaceKey = (key: string, options?: { readonly home?: string }): Result.Result<PlaceKey, string> =>
  Result.map(parsePlaceKey(key), (place) => formatParsedPlace(place, options?.home));

/** Repo places root at their repo id; directory places at `~` or `/`; named places share one root. */
const placeRootOf = (place: ParsedPlace): string => {
  switch (place.form) {
    case "repo":
      return `repo:${place.repoId}`;
    case "directory":
      return `directory:${place.root}`;
    case "named":
      return "named";
  }
};

/**
 * True when `scopePlace` is `contextPlace` or one of its ancestors. Both keys must be canonical. A
 * repo place never covers a directory place, and descendants never count.
 */
export const placeCovers = (scopePlace: PlaceKey, contextPlace: PlaceKey): boolean => {
  const scope = parsePlaceKey(scopePlace);
  const context = parsePlaceKey(contextPlace);
  if (Result.isFailure(scope) || Result.isFailure(context)) return false;
  if (placeRootOf(scope.success) !== placeRootOf(context.success)) return false;
  const scopeSegments = scope.success.segments;
  return scopeSegments.every((segment, index) => context.success.segments[index] === segment);
};

/** A repo place's root (`github.com/x/y::`); any other place unchanged. */
export const repoRootPlace = (place: PlaceKey): PlaceKey => {
  const parsed = parsePlaceKey(place);
  if (Result.isFailure(parsed) || parsed.success.form !== "repo") return place;
  return `${parsed.success.repoId}${REPO_PLACE_SEPARATOR}`;
};

/** A short label: `GLips/taste`, `GLips/taste › apps/billing`, or the key itself for other places. */
export const formatPlaceLabel = (place: PlaceKey): string => {
  const parsed = parsePlaceKey(place);
  if (Result.isFailure(parsed) || parsed.success.form !== "repo") return place;
  const repoName = parsed.success.repoId.split("/").slice(1).join("/") || parsed.success.repoId;
  return parsed.success.segments.length === 0 ? repoName : `${repoName} › ${parsed.success.segments.join("/")}`;
};
