/**
 * Writes the npm packages into dist/npm/ from the binaries in dist/bin/: a launcher package whose `taste` runs
 * the right platform package's binary, and one package per platform. No postinstall anywhere: pnpm and bun
 * block them by default. Run `bun scripts/build-taste-binary.ts --all` first.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { TASTE_VERSION } from "@taste/core/taste-vocabulary";

import { buildTasteLauncher } from "./build-taste-launcher.ts";
import { TASTE_NPM_PACKAGE_NAME, TASTE_RELEASE_REPO, TASTE_RELEASE_TARGETS } from "./release-names.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const npmDir = `${root}dist/npm`;
const sharedFields = { version: TASTE_VERSION, license: "UNLICENSED", repository: `github:${TASTE_RELEASE_REPO}` };
const platforms = TASTE_RELEASE_TARGETS.map((target) => target.replace(/^bun-/, ""));

const writeJson = (path: string, value: unknown) => Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);

const writePlatformPackage = (platform: string) => {
  const binary = `${root}dist/bin/${platform}/taste`;
  if (!existsSync(binary)) throw new Error(`${binary} is missing: build it with build-taste-binary.ts`);
  const [os = "", cpu = ""] = platform.split("-");
  const packageDir = `${npmDir}/${platform}`;
  mkdirSync(`${packageDir}/bin`, { recursive: true });
  cpSync(binary, `${packageDir}/bin/taste`);
  chmodSync(`${packageDir}/bin/taste`, 0o755);
  return writeJson(`${packageDir}/package.json`, {
    name: `${TASTE_NPM_PACKAGE_NAME}-${platform}`,
    ...sharedFields,
    description: `The taste binary for ${platform}. Install ${TASTE_NPM_PACKAGE_NAME}, not this.`,
    os: [os],
    cpu: [cpu],
    files: ["bin/taste"],
  });
};

const writeLauncherPackage = async () => {
  const launcherDir = `${npmDir}/launcher`;
  chmodSync(await buildTasteLauncher(`${launcherDir}/bin`), 0o755);
  await writeJson(`${launcherDir}/package.json`, {
    name: TASTE_NPM_PACKAGE_NAME,
    ...sharedFields,
    description: "Human-ratified taste for agents.",
    type: "module",
    bin: { taste: "bin/taste.js" },
    files: ["bin/taste.js"],
    engines: { node: ">=18" },
    optionalDependencies: Object.fromEntries(
      platforms.map((platform) => [`${TASTE_NPM_PACKAGE_NAME}-${platform}`, TASTE_VERSION]),
    ),
  });
};

rmSync(npmDir, { recursive: true, force: true });
await Promise.all([...platforms.map(writePlatformPackage), writeLauncherPackage()]);
process.stdout.write(`npm packages: ${String(platforms.length + 1)} in ${npmDir}\n`);
