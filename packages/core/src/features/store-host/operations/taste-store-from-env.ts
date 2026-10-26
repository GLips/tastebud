/** How a shell finds its store: `--store`, then `TASTE_STORE`, then `~/.taste`. */
import { processEnvironment, readTasteStoreVariable } from "#core/env.ts";
import { provideTasteStore } from "#core/features/record-store/index.server.ts";
import { resolveStoreRoot } from "#core/infrastructure/store-root.ts";

/** The store root for this process, `flag` winning over `TASTE_STORE`. Read per call, never cached. */
export const resolveTasteStoreRoot = (flag?: string) => resolveStoreRoot({ flag, env: readTasteStoreVariable() });

/** Provides the store `resolveTasteStoreRoot(flag)` names, as `provideTasteStore` does. */
export const tasteStoreFromEnv = (flag?: string) => provideTasteStore(resolveTasteStoreRoot(flag));

/** This process's environment with `TASTE_STORE` set to `root`, for a child shell serving that store. */
export const childProcessEnvWithStore = (root: string) => ({
  ...processEnvironment(),
  TASTE_STORE: root,
});
