/**
 * Lays out the `tastebud` npm package: the launcher bundled for plain Node beside the Claude Code plugin's
 * bin/tastebud shim and its scripts, so npx and the plugin fetch and cache the release binary one way. No
 * binary and no postinstall (pnpm and bun block them): the first run downloads, as the plugin's does.
 */
import { chmodSync, cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { TASTEBUD_VERSION } from "@tastebud/core/taste-vocabulary";

import { TASTEBUD_NPM_PACKAGE_NAME, TASTEBUD_RELEASE_REPO } from "./release-names.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const LAUNCHER_SOURCE = fileURLToPath(new URL("tastebud-launcher.ts", import.meta.url));
// The shim finds its scripts as ../scripts and reads the version from ../package.json, so the layout is fixed.
const PLUGIN_FILES = ["bin/tastebud", "scripts/binary-path.sh", "scripts/install.sh"];

/** Writes the package into `packageDir`, ready for `npm publish` or `npm pack`. */
export const writeTastebudNpmPackage = async (packageDir: string) => {
  mkdirSync(`${packageDir}/bin`, { recursive: true });
  const built = await Bun.build({
    entrypoints: [LAUNCHER_SOURCE],
    outdir: `${packageDir}/bin`,
    naming: "tastebud.js",
    target: "node",
    format: "esm",
  });
  if (!built.success) throw new AggregateError(built.logs, "the tastebud launcher did not build");
  chmodSync(`${packageDir}/bin/tastebud.js`, 0o755);
  for (const file of PLUGIN_FILES) cpSync(`${root}plugins/tastebud/${file}`, `${packageDir}/${file}`);
  cpSync(`${root}LICENSE`, `${packageDir}/LICENSE`);
  cpSync(`${root}README.md`, `${packageDir}/README.md`);
  const manifest = {
    name: TASTEBUD_NPM_PACKAGE_NAME,
    version: TASTEBUD_VERSION,
    description: "Human-ratified taste for agents.",
    license: "MIT",
    repository: `github:${TASTEBUD_RELEASE_REPO}`,
    type: "module",
    bin: { tastebud: "bin/tastebud.js" },
    files: ["bin/tastebud.js", ...PLUGIN_FILES, "LICENSE", "README.md"],
    // The platforms a release has a binary for; npm refuses the rest up front.
    os: ["darwin", "linux"],
    cpu: ["arm64", "x64"],
    engines: { node: ">=18" },
  };
  await Bun.write(`${packageDir}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  return packageDir;
};
