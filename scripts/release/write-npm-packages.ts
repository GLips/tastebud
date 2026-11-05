/**
 * Writes the npm packages into dist/npm/ from the binaries in dist/bin/: a launcher package whose `tastebud` runs
 * the right platform package's binary, and one package per platform. No postinstall anywhere: pnpm and bun
 * block them by default. Run `bun scripts/build-tastebud-binary.ts --all` first.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { TASTEBUD_VERSION } from "@tastebud/core/taste-vocabulary";

import { buildTastebudLauncher } from "./build-tastebud-launcher.ts";
import { TASTEBUD_NPM_PACKAGE_NAME, TASTEBUD_RELEASE_REPO, TASTEBUD_RELEASE_TARGETS } from "./release-names.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const npmDir = `${root}dist/npm`;
const licenseFile = `${root}LICENSE`;
const sharedFields = { version: TASTEBUD_VERSION, license: "MIT", repository: `github:${TASTEBUD_RELEASE_REPO}` };
const platforms = TASTEBUD_RELEASE_TARGETS.map((target) => target.replace(/^bun-/, ""));

const writeJson = (path: string, value: unknown) => Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);

const writePlatformPackage = (platform: string) => {
  const binary = `${root}dist/bin/${platform}/tastebud`;
  if (!existsSync(binary)) throw new Error(`${binary} is missing: build it with build-tastebud-binary.ts`);
  const [os = "", cpu = ""] = platform.split("-");
  const packageDir = `${npmDir}/${platform}`;
  mkdirSync(`${packageDir}/bin`, { recursive: true });
  cpSync(binary, `${packageDir}/bin/tastebud`);
  cpSync(licenseFile, `${packageDir}/LICENSE`);
  chmodSync(`${packageDir}/bin/tastebud`, 0o755);
  return writeJson(`${packageDir}/package.json`, {
    name: `${TASTEBUD_NPM_PACKAGE_NAME}-${platform}`,
    ...sharedFields,
    description: `The tastebud binary for ${platform}. Install ${TASTEBUD_NPM_PACKAGE_NAME}, not this.`,
    os: [os],
    cpu: [cpu],
    files: ["bin/tastebud", "LICENSE"],
  });
};

const writeLauncherPackage = async () => {
  const launcherDir = `${npmDir}/launcher`;
  chmodSync(await buildTastebudLauncher(`${launcherDir}/bin`), 0o755);
  cpSync(licenseFile, `${launcherDir}/LICENSE`);
  await writeJson(`${launcherDir}/package.json`, {
    name: TASTEBUD_NPM_PACKAGE_NAME,
    ...sharedFields,
    description: "Human-ratified taste for agents.",
    type: "module",
    bin: { tastebud: "bin/tastebud.js" },
    files: ["bin/tastebud.js", "LICENSE"],
    engines: { node: ">=18" },
    optionalDependencies: Object.fromEntries(
      platforms.map((platform) => [`${TASTEBUD_NPM_PACKAGE_NAME}-${platform}`, TASTEBUD_VERSION]),
    ),
  });
};

rmSync(npmDir, { recursive: true, force: true });
await Promise.all([...platforms.map(writePlatformPackage), writeLauncherPackage()]);
process.stdout.write(`npm packages: ${String(platforms.length + 1)} in ${npmDir}\n`);
