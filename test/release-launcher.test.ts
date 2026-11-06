/**
 * The npm package under real Node, as write-npm-package.ts lays it out: its launcher fetches the release
 * binary through the plugin's shim on first run, then runs it offline, passing arguments, exit codes and signals.
 */
import { expect, test } from "bun:test";
import { join } from "node:path";

import { writeTastebudNpmPackage } from "../scripts/release/build-tastebud-npm-package.ts";
import { makeTemporaryDirectory, serveFakeRelease } from "./support.ts";

// Bun puts a `node` that is Bun itself first on a child's PATH; the launcher must run under Node.
const realNode = Bun.which("node", {
  PATH: (process.env["PATH"] ?? "")
    .split(":")
    .filter((entry) => !entry.includes("/bun-node-"))
    .join(":"),
});

/** The package's launcher, with an empty cache, fetching from `releaseUrl`. */
const installPackage = async (releaseUrl: string) => {
  const packageDir = await writeTastebudNpmPackage(join(makeTemporaryDirectory("npm"), "tastebud"));
  const env = {
    PATH: process.env["PATH"] ?? "",
    HOME: makeTemporaryDirectory("npm-home"),
    XDG_CACHE_HOME: makeTemporaryDirectory("npm-cache"),
    TASTEBUD_INSTALL_BASE_URL: releaseUrl,
  };
  return { launcher: join(packageDir, "bin/tastebud.js"), env };
};

const runLauncher = async ({ launcher, env }: Awaited<ReturnType<typeof installPackage>>) => {
  const child = Bun.spawn([realNode ?? "node", launcher, "review", "--port", "4801"], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return { exitCode, stdout };
};

test("concurrent first runs download the release once; later runs are offline and pass args and exit codes", async () => {
  expect(realNode).not.toBeNull();
  const release = await serveFakeRelease('#!/bin/sh\necho "tastebud got: $*"\nexit 7\n');
  const installed = await installPackage(release.url);
  const firstRuns = await Promise.all([runLauncher(installed), runLauncher(installed), runLauncher(installed)]);
  await release.server.stop(true);
  const ranOk = { exitCode: 7, stdout: "tastebud got: review --port 4801\n" };
  // stdout carries only the binary's own: under MCP it is the protocol stream.
  expect(firstRuns).toEqual([ranOk, ranOk, ranOk]);
  expect(release.fetched.archives).toBe(1);
  expect(await runLauncher(installed)).toEqual(ranOk);
});

test("a SIGTERM sent to the launcher alone reaches the binary, and the launcher dies by it too", async () => {
  // install.sh runs `--version` on what it installs, so only a real start sleeps.
  const release = await serveFakeRelease('#!/bin/sh\n[ "$1" = --version ] && exit 0\necho $$\nexec sleep 30\n');
  const { launcher, env } = await installPackage(release.url);
  const node = Bun.spawn([realNode ?? "node", launcher, "review"], { env, stdout: "pipe", stderr: "ignore" });
  // The binary's first output line is its pid, so it is running once this read returns.
  const firstChunk = await node.stdout.getReader().read();
  await release.server.stop(true);
  const binaryPid = Number(new TextDecoder().decode(firstChunk.value).trim());

  node.kill("SIGTERM");
  await node.exited;
  expect(node.signalCode).toBe("SIGTERM");
  // Signal 0 only probes: it throws once the binary is gone.
  expect(() => process.kill(binaryPid, 0)).toThrow();
});
