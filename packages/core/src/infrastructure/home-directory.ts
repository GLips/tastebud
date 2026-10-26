import { realpathSync } from "node:fs";
import { homedir } from "node:os";

/** The user's home directory, as `~/` in place keys and input paths expands to. */
export const homeDirectory = (): string => homedir();

/**
 * The home directory with symlinks resolved, so a realpath'd cwd under it still reads as `~/…`.
 * An unreadable home is used as given.
 */
export const realHomeDirectory = (): string => {
  const home = homedir();
  try {
    return realpathSync(home);
  } catch {
    return home;
  }
};
