#!/usr/bin/env node
/**
 * The npm package's `tastebud`, run by Node: runs the plugin's bin/tastebud shim that the package ships beside
 * it, which execs the release binary of the package.json version, fetching it once from the GitHub release
 * into the cache the Claude Code plugin uses. Bundled into the package by build-tastebud-npm-package.ts.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Node runs a bin through its real path, so this resolves inside the package even from node_modules/.bin.
const shim = fileURLToPath(new URL("tastebud", import.meta.url));

// Through sh, so the shim needs no exec bit, whatever mode the tarball left it with.
const child = spawn("/bin/sh", [shim, ...process.argv.slice(2)], { stdio: "inherit" });
// A targeted kill reaches only this process, not the group a terminal's Ctrl-C reaches; passing it on keeps
// `tastebud review` from outliving the launcher while still holding its port. The shim execs the binary,
// so the binary is this child.
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
