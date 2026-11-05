/** Bundles tastebud-launcher.ts into one plain-Node ESM file, with the release names inlined. */
import { fileURLToPath } from "node:url";

const LAUNCHER_SOURCE = fileURLToPath(new URL("tastebud-launcher.ts", import.meta.url));

/** Writes `<outdir>/tastebud.js`. Its package.json must say `"type": "module"`. */
export const buildTastebudLauncher = async (outdir: string) => {
  const built = await Bun.build({
    entrypoints: [LAUNCHER_SOURCE],
    outdir,
    naming: "tastebud.js",
    target: "node",
    format: "esm",
  });
  if (!built.success) throw new AggregateError(built.logs, "the tastebud launcher did not build");
  return `${outdir}/tastebud.js`;
};
