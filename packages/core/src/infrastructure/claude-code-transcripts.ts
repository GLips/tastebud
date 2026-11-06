/**
 * Claude Code's session transcripts, read only: `<CLAUDE_CONFIG_DIR or ~/.claude>/projects/<project>/<session>.jsonl`.
 * Subagent transcripts nest a level deeper and are not listed. Every file read must resolve, symlinks
 * followed, inside the projects directory.
 */
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

import { Effect } from "effect";

import { readClaudeConfigDirVariable } from "#core/env.ts";

import { TranscriptReadFailed, TranscriptReferenceUnresolved } from "./claude-code-transcript-errors.ts";
import { homeDirectory } from "./home-directory.ts";
import { errorCodeOf } from "./store-errors.ts";

/** The directory Claude Code keeps one folder of transcripts per project in. */
export const claudeCodeTranscriptRoot = (): string =>
  join(readClaudeConfigDirVariable() ?? join(homeDirectory(), ".claude"), "projects");

/** Claude Code names a transcript by its session id, a uuid; anything else could walk out of the root. */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

const isInside = (root: string, path: string) => {
  const fromRoot = relative(root, path);
  return fromRoot !== "" && !fromRoot.startsWith("..") && !isAbsolute(fromRoot);
};

const readFailed = (path: string) => (cause: unknown) => new TranscriptReadFailed({ path, problem: String(cause) });

type ConfinedFile =
  | { readonly real: string; readonly modifiedMs: number }
  | { readonly refused: string }
  | { readonly missing: true };

/**
 * `path` with symlinks resolved, refused when that leaves `realRoot` or isn't a file. Missing covers
 * a dangling symlink and a session deleted since its directory was listed.
 */
const confinedFile = async (realRoot: string, path: string): Promise<ConfinedFile> => {
  try {
    const real = await realpath(path);
    if (!isInside(realRoot, real)) return { refused: `it resolves outside ${realRoot}` };
    const info = await stat(real);
    return info.isFile() ? { real, modifiedMs: info.mtimeMs } : { refused: "it is not a file" };
  } catch (cause) {
    if (errorCodeOf(cause) === "ENOENT") return { missing: true };
    throw cause;
  }
};

/** The real transcript root, or undefined when Claude Code has written none there. */
const realTranscriptRoot = async (root: string) => {
  try {
    return await realpath(root);
  } catch (cause) {
    if (errorCodeOf(cause) === "ENOENT") return undefined;
    throw cause;
  }
};

/** The real path of each project directory under the root. */
const projectDirectories = async (realRoot: string) =>
  (await readdir(realRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(realRoot, entry.name));

export interface ClaudeCodeTranscriptFile {
  readonly session: string;
  readonly path: string;
}

const sessionFilesIn = async (project: string) =>
  (await readdir(project)).flatMap((name) => {
    const session = name.slice(0, -".jsonl".length);
    return name.endsWith(".jsonl") && SESSION_ID.test(session) ? [{ session, path: join(project, name) }] : [];
  });

const listTranscriptFiles = async (sinceMs: number): Promise<Array<ClaudeCodeTranscriptFile>> => {
  const realRoot = await realTranscriptRoot(claudeCodeTranscriptRoot());
  if (realRoot === undefined) return [];
  const named = (await Promise.all((await projectDirectories(realRoot)).map(sessionFilesIn))).flat();
  const checked = await Promise.all(
    named.map(async ({ session, path }) => ({ session, file: await confinedFile(realRoot, path) })),
  );
  return checked.flatMap(({ session, file }) =>
    "real" in file && file.modifiedMs >= sinceMs ? [{ session, path: file.real }] : [],
  );
};

/** Transcripts written to at or after `sinceMs`, from the main conversation of each session. */
export const listClaudeCodeTranscripts = (sinceMs: number) =>
  Effect.tryPromise({ try: () => listTranscriptFiles(sinceMs), catch: readFailed(claudeCodeTranscriptRoot()) });

/** A transcript's lines. The last may be a line Claude Code is still writing; it won't decode. */
export const readClaudeCodeTranscriptFile = (path: string) =>
  Effect.tryPromise({ try: () => readFile(path, "utf8"), catch: readFailed(path) }).pipe(
    Effect.map((text) => text.split("\n")),
  );

const findTranscript = async (session: string) => {
  const realRoot = await realTranscriptRoot(claudeCodeTranscriptRoot());
  if (realRoot === undefined)
    return { problem: `there are no Claude Code transcripts at ${claudeCodeTranscriptRoot()}` };
  const projects = await projectDirectories(realRoot);
  const found = await Promise.all(projects.map((project) => confinedFile(realRoot, join(project, `${session}.jsonl`))));
  const first = found.find((file) => !("missing" in file));
  if (first === undefined || "missing" in first)
    return { problem: `no transcript for it under ${claudeCodeTranscriptRoot()}` };
  return "real" in first ? { path: first.real } : { problem: first.refused };
};

/** The transcript file of `session`, confined to the transcript root. */
export const locateClaudeCodeTranscript = Effect.fn("claude-code-transcripts.locateClaudeCodeTranscript")(function* (
  session: string,
) {
  if (!SESSION_ID.test(session))
    return yield* new TranscriptReferenceUnresolved({ session, problem: "a session id is letters, digits and dashes" });
  const found = yield* Effect.tryPromise({
    try: () => findTranscript(session),
    catch: readFailed(claudeCodeTranscriptRoot()),
  });
  if ("problem" in found) return yield* new TranscriptReferenceUnresolved({ session, problem: found.problem });
  return found.path;
});
