import { isAbsolute, join, resolve } from "node:path";

import { Effect } from "effect";

import { homeDirectory } from "#core/infrastructure/home-directory.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

/** A directory from input, absolute: `~/…` under home, a relative path only against the caller's cwd. */
export const expandInputDirectory = Effect.fn("place-context.expandInputDirectory")(function* (
  field: string,
  directory: string,
  cwd: string | undefined,
) {
  if (directory === "~" || directory.startsWith("~/")) return join(homeDirectory(), directory.slice(1));
  if (isAbsolute(directory)) return directory;
  if (cwd === undefined)
    return yield* new InvalidTasteInput({
      problems: [`${field}: "${directory}" is relative, and this caller has no cwd`],
    });
  return resolve(cwd, directory);
});
