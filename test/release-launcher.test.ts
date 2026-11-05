/** The npm launcher under real Node, against platform packages laid out as npm installs them. */
import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildTastebudLauncher } from "../scripts/release/build-tastebud-launcher.ts";
import { TASTEBUD_NPM_PACKAGE_NAME } from "../scripts/release/release-names.ts";
import { makeTemporaryDirectory } from "./support.ts";

// Bun puts a `node` that is Bun itself first on a child's PATH; the launcher must run under Node.
const realNode = Bun.which("node", {
  PATH: (process.env["PATH"] ?? "")
    .split(":")
    .filter((entry) => !entry.includes("/bun-node-"))
    .join(":"),
});

const EXIT_SEVEN_BINARY = '#!/bin/sh\necho "tastebud got: $*"\nexit 7\n';

/** node_modules with the launcher package and, if `withPlatformPackage`, this platform's, running `binaryScript`. */
const installLauncher = async (withPlatformPackage: boolean, binaryScript = EXIT_SEVEN_BINARY) => {
  const modules = join(makeTemporaryDirectory("npm"), "node_modules");
  const launcherDir = join(modules, TASTEBUD_NPM_PACKAGE_NAME);
  const launcher = await buildTastebudLauncher(join(launcherDir, "bin"));
  writeFileSync(join(launcherDir, "package.json"), JSON.stringify({ name: TASTEBUD_NPM_PACKAGE_NAME, type: "module" }));
  if (withPlatformPackage) {
    const platformDir = join(modules, `${TASTEBUD_NPM_PACKAGE_NAME}-${process.platform}-${process.arch}`);
    mkdirSync(join(platformDir, "bin"), { recursive: true });
    writeFileSync(join(platformDir, "package.json"), "{}");
    writeFileSync(join(platformDir, "bin/tastebud"), binaryScript);
    chmodSync(join(platformDir, "bin/tastebud"), 0o755);
  }
  return launcher;
};

const runLauncher = (launcher: string) => {
  const result = Bun.spawnSync([realNode ?? "node", launcher, "review", "--port", "4801"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
};

test("the launcher runs the platform binary with its arguments and passes its exit code through", async () => {
  expect(realNode).not.toBeNull();
  expect(runLauncher(await installLauncher(true))).toEqual({
    exitCode: 7,
    stdout: "tastebud got: review --port 4801\n",
    stderr: "",
  });
});

test("with no platform package the launcher exits 1 naming the reinstall and the releases page", async () => {
  const missing = runLauncher(await installLauncher(false));
  expect(missing.exitCode).toBe(1);
  expect(missing.stderr).toContain(`npm install ${TASTEBUD_NPM_PACKAGE_NAME}`);
  expect(missing.stderr).toContain("/releases");
});

test("a SIGTERM sent to the launcher alone reaches the binary, and the launcher dies by it too", async () => {
  const launcher = await installLauncher(true, "#!/bin/sh\necho $$\nexec sleep 30\n");
  const node = Bun.spawn([realNode ?? "node", launcher, "review"], { stdout: "pipe", stderr: "ignore" });
  // The binary's first output line is its pid, so it is running once this read returns.
  const firstChunk = await node.stdout.getReader().read();
  const binaryPid = Number(new TextDecoder().decode(firstChunk.value).trim());

  node.kill("SIGTERM");
  await node.exited;
  expect(node.signalCode).toBe("SIGTERM");
  // Signal 0 only probes: it throws once the binary is gone.
  expect(() => process.kill(binaryPid, 0)).toThrow();
});
