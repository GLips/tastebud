/** Bundles taste-launcher.ts into one plain-Node ESM file, with the release names inlined. */
import { fileURLToPath } from "node:url";

const LAUNCHER_SOURCE = fileURLToPath(new URL("taste-launcher.ts", import.meta.url));

/** Writes `<outdir>/taste.js`. Its package.json must say `"type": "module"`. */
export const buildTasteLauncher = async (outdir: string) => {
  const built = await Bun.build({
    entrypoints: [LAUNCHER_SOURCE],
    outdir,
    naming: "taste.js",
    target: "node",
    format: "esm",
  });
  if (!built.success) throw new AggregateError(built.logs, "the taste launcher did not build");
  return `${outdir}/taste.js`;
};
