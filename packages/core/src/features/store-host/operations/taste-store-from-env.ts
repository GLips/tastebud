/** How a shell finds its store: `--store`, then `TASTE_STORE`, then `~/.taste`. */
import { pinTasteStoreVariable, readTasteStoreVariable } from "#core/env.ts";
import { provideTasteStore } from "#core/features/record-store/index.server.ts";
import { resolveStoreRoot } from "#core/infrastructure/store-root.ts";

/** The store root for this process, `flag` winning over `TASTE_STORE`. Read per call, never cached. */
export const resolveTasteStoreRoot = (flag?: string) => resolveStoreRoot({ flag, env: readTasteStoreVariable() });

/** Provides the store `resolveTasteStoreRoot(flag)` names, as `provideTasteStore` does. */
export const tasteStoreFromEnv = (flag?: string) => provideTasteStore(resolveTasteStoreRoot(flag));

/** Makes `root` this process's store for every later `resolveTasteStoreRoot()` without a flag. */
export const pinTasteStoreForThisProcess = (root: string): void => pinTasteStoreVariable(root);
