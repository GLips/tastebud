import { join, resolve } from "node:path";

import { homeDirectory } from "./home-directory.ts";

/** `--store`, then `TASTE_STORE`, then `~/.taste`. Empty strings count as unset; `~/` expands. */
export const resolveStoreRoot = (options: {
  readonly flag?: string | undefined;
  readonly env?: string | undefined;
}) => {
  const chosen = options.flag || options.env || "~/.taste";
  return chosen === "~" || chosen.startsWith("~/") ? join(homeDirectory(), chosen.slice(1)) : resolve(chosen);
};
