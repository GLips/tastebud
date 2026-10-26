/** Asks git about a directory. Bun.spawn with git's repository overrides removed from the environment. */
import { Effect } from "effect";

import { processEnvironmentWithoutGitOverrides } from "#core/env.ts";

import { PlaceResolutionFailed } from "./store-errors.ts";

/** Each git call gets this long. Two run in parallel, well inside the hook's 650 ms. */
const GIT_TIMEOUT_MS = 300;

interface GitOutput {
  readonly exitCode: number;
  readonly stdout: string;
}

const runGit = (directory: string, args: ReadonlyArray<string>) =>
  Effect.tryPromise({
    try: async (): Promise<GitOutput> => {
      const child = Bun.spawn(["git", "-C", directory, ...args], {
        env: processEnvironmentWithoutGitOverrides(),
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

/** The directory's path inside its checkout and its origin URL; undefined outside a checkout or without an origin. */
export const readGitCheckoutFacts = (directory: string) =>
  Effect.map(
    Effect.all(
      [runGit(directory, ["rev-parse", "--show-prefix"]), runGit(directory, ["config", "--get", "remote.origin.url"])],
      { concurrency: "unbounded" },
    ),
    ([prefix, origin]) =>
      prefix.exitCode !== 0 || origin.exitCode !== 0 ? undefined : { prefix: prefix.stdout, originUrl: origin.stdout },
  );
