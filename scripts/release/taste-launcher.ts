#!/usr/bin/env node
/**
 * The npm package's `taste`, run by Node: execs the compiled binary from the platform package npm installed beside
 * it (an optionalDependency npm picks by os and cpu). It never downloads; a missing package means reinstall.
 * Bundled into the launcher package by build-taste-launcher.ts.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { TASTE_NPM_PACKAGE_NAME, TASTE_RELEASE_REPO } from "./release-names.ts";

const platformPackage = `${TASTE_NPM_PACKAGE_NAME}-${process.platform}-${process.arch}`;
const resolveBesideLauncher = createRequire(import.meta.url).resolve;

const findPlatformBinary = () => {
  try {
    return join(dirname(resolveBesideLauncher(`${platformPackage}/package.json`)), "bin", "taste");
  } catch {
    return undefined;
  }
};

const binary = findPlatformBinary();
if (binary === undefined) {
  process.stderr.write(
    `taste: ${platformPackage} is not installed, so there is no taste binary for ${process.platform}-${process.arch}.\n` +
      `Reinstall without --omit=optional (npm install ${TASTE_NPM_PACKAGE_NAME}), or download one from\n` +
      `https://github.com/${TASTE_RELEASE_REPO}/releases\n`,
  );
  process.exit(1);
}

const child = spawn(binary, process.argv.slice(2), { stdio: "inherit" });
// A targeted kill reaches only this process, not the group a terminal's Ctrl-C reaches; passing it on keeps
// `taste review` from outliving the launcher while still holding its port.
const forwardedSignals = ["SIGTERM", "SIGINT", "SIGHUP"] as const;
for (const signal of forwardedSignals) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  throw error;
});
child.on("exit", (code, signal) => {
  // A binary ended by a signal ends this process the same way, so the shell sees what really happened.
  if (signal) {
    for (const forwarded of forwardedSignals) process.removeAllListeners(forwarded);
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
