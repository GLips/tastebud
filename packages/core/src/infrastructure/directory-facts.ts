import { realpathSync, statSync } from "node:fs";

import { Effect } from "effect";

import { PlaceResolutionFailed } from "./store-errors.ts";

/** `directory` with symlinks resolved, failing when it is not a readable directory. */
export const realDirectoryOf = (directory: string) =>
  Effect.try({
    try: () => {
      const real = realpathSync(directory);
      if (!statSync(real).isDirectory()) throw new Error("not a directory");
      return real;
    },
    catch: (error) =>
      new PlaceResolutionFailed({ directory, problem: `it is not a readable directory (${String(error)})` }),
  });
