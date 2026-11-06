/** Writes the `tastebud` npm package into dist/npm/tastebud, for release.yml to publish. */
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { writeTastebudNpmPackage } from "./build-tastebud-npm-package.ts";

const packageDir = fileURLToPath(new URL("../../dist/npm/tastebud", import.meta.url));
rmSync(packageDir, { recursive: true, force: true });
process.stdout.write(`npm package: ${await writeTastebudNpmPackage(packageDir)}\n`);
