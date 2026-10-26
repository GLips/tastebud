import { fileURLToPath } from "node:url";

import { Effect } from "effect";

import { childProcessEnvWithStore } from "./taste-core.ts";

// Vite runs from the review app's own directory, found beside this package in the workspace. The CLI
// launches it as a process rather than importing it, so it isn't a dependency.
const REVIEW_APP_ROOT = fileURLToPath(new URL("../../../../apps/review", import.meta.url));

/** Starts the review app's dev server for the store at `root`; `exited` settles with its exit code. */
export const spawnReviewAppProcess = (port: number, root: string) =>
  Effect.sync(() => {
    // `--bun`: the server functions import core, which needs bun:sqlite, so vite must run under Bun.
    const child = Bun.spawn(["bunx", "--bun", "vite", "--port", String(port), "--strictPort"], {
      cwd: REVIEW_APP_ROOT,
      env: childProcessEnvWithStore(root),
      stdio: ["inherit", "inherit", "inherit"],
    });
    return { exited: Effect.promise(() => child.exited) };
  });

/** A failing child's exit code becomes this process's. */
export const adoptChildExitCode = (code: number) =>
  Effect.sync(() => {
    if (code !== 0) process.exitCode = code;
  });
