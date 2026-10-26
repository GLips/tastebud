/**
 * The one reader of `process.env` in Taste. `TASTE_STORE` is the only variable Taste defines; the
 * rest is passed through, to git and to a store's custom place resolver.
 */
type ProcessEnvironment = Readonly<Record<string, string | undefined>>;

/** `TASTE_STORE`, the store root a shell uses when no `--store` is given. Blank counts as unset. */
export const readTasteStoreVariable = (): string | undefined => process.env["TASTE_STORE"] || undefined;

/** The whole environment, for a custom resolver's `env` and for child processes. */
export const processEnvironment = (): ProcessEnvironment => process.env;

/**
 * The environment minus git's repository overrides (`GIT_DIR`, `GIT_INDEX_FILE`, …). A git hook sets
 * them, and they would win over `-C directory`, resolving every directory to the hook's repo.
 */
export const processEnvironmentWithoutGitOverrides = (): ProcessEnvironment =>
  Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
