/**
 * The one reader and writer of `process.env` in Tastebud. `TASTEBUD_STORE` is the only variable Tastebud defines; the
 * rest is passed through, to git and to a store's custom place resolver.
 */
type ProcessEnvironment = Readonly<Record<string, string | undefined>>;

/** `TASTEBUD_STORE`, the store root a shell uses when no `--store` is given. Blank counts as unset. */
export const readTastebudStoreVariable = (): string | undefined => process.env["TASTEBUD_STORE"] || undefined;

/**
 * Points this process's `TASTEBUD_STORE` at `root`, so code resolving its store per call (the review server
 * functions `tastebud review` serves in-process) reaches the store the command was given.
 */
export const pinTastebudStoreVariable = (root: string): void => {
  process.env["TASTEBUD_STORE"] = root;
};

/** The whole environment, for a custom resolver's `env` and for child processes. */
export const processEnvironment = (): ProcessEnvironment => process.env;

/**
 * The environment minus git's repository overrides (`GIT_DIR`, `GIT_INDEX_FILE`, …). A git hook sets
 * them, and they would win over `-C directory`, resolving every directory to the hook's repo.
 */
export const processEnvironmentWithoutGitOverrides = (): ProcessEnvironment =>
  Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
