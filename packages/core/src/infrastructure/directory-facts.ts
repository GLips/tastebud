import { realpathSync, statSync } from "node:fs";

import { Effect } from "effect";

import { errorCodeOf, PlaceResolutionFailed } from "./store-errors.ts";

// The common ways a path can't be read, in plain words; anything rarer keeps the system's own message.
const UNREADABLE_PATH_PROBLEMS = new Map([
  ["ENOENT", "no folder there"],
  ["ENOTDIR", "part of the path is a file, not a folder"],
  ["EACCES", "you don't have permission to read it"],
]);

/** `directory` with symlinks resolved, failing when it is not a readable directory. */
export const realDirectoryOf = (directory: string) =>
  Effect.try({
    try: () => {
      const real = realpathSync(directory);
      return { real, isDirectory: statSync(real).isDirectory() };
    },
    catch: (error) =>
      new PlaceResolutionFailed({
        directory,
        problem: UNREADABLE_PATH_PROBLEMS.get(errorCodeOf(error) ?? "") ?? `it can't be read (${String(error)})`,
      }),
  }).pipe(
    Effect.filterOrFail(
      ({ isDirectory }) => isDirectory,
      () => new PlaceResolutionFailed({ directory, problem: "it is a file, not a folder" }),
    ),
    Effect.map(({ real }) => real),
  );
