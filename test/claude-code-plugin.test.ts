/**
 * The Claude Code plugin in plugins/tastebud as Claude Code runs it: its manifest and install lines in step
 * with the release, `bin/tastebud` fetching that release once, the prompt hook's gate, and the whole loop
 * from a capture over the plugin's MCP server to the hook recalling the accepted belief. Under TASTEBUD_TEST_BINARY the served release is that compiled binary.
 */
import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { agentHostConnectLinesFor, shellQuotedWord } from "@tastebud/core/agent-hosts";
import { TASTEBUD_CONFIG_FILE } from "@tastebud/core/store-config";
import { TASTEBUD_VERSION } from "@tastebud/core/taste-vocabulary";
import { Schema } from "effect";

import {
  callerFor,
  makeGitRepo,
  makeTestStore,
  makeTemporaryDirectory,
  runOperation,
  serveFakeRelease,
  fakeTastebudBinary,
  TASTEBUD_COMMAND_LINE,
  tastebudProcessEnv,
} from "./support.ts";

const REPO = join(import.meta.dir, "..");
const PLUGIN = join(REPO, "plugins/tastebud");
const SHIM = join(PLUGIN, "bin/tastebud");
const PROMPT_HOOK = join(PLUGIN, "hooks/prompt-hook.sh");

const HookCommandsSchema = Schema.Array(
  Schema.Struct({
    hooks: Schema.Array(Schema.Struct({ command: Schema.String, async: Schema.optionalKey(Schema.Boolean) })),
  }),
);
const decodePluginManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ name: Schema.String, version: Schema.String })),
);
const decodeMarketplace = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ plugins: Schema.Array(Schema.Struct({ name: Schema.String, source: Schema.String })) }),
  ),
);
const decodeMcpServers = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      mcpServers: Schema.Record(
        Schema.String,
        Schema.Struct({ command: Schema.String, args: Schema.Array(Schema.String) }),
      ),
    }),
  ),
);
const decodeHooks = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ hooks: Schema.Struct({ SessionStart: HookCommandsSchema, UserPromptSubmit: HookCommandsSchema }) }),
  ),
);
const readText = (path: string) => readFileSync(path, "utf8");
const decodeCapturedSourceId = Schema.decodeUnknownSync(
  Schema.Struct({ source: Schema.Struct({ source: Schema.Struct({ id: Schema.String }) }) }),
);

const openClients: Array<Client> = [];
afterEach(async () => {
  await Promise.all(openClients.splice(0).map((client) => client.close()));
});

const FAKE_BINARY = fakeTastebudBinary('echo "ran $* <$(cat)>"');

/** A cache directory holding `script` where `bin/tastebud` looks for this version's binary. */
const cacheWithBinary = (script: string | undefined) => {
  const cache = makeTemporaryDirectory("plugin-cache");
  if (script === undefined) return cache;
  mkdirSync(join(cache, "tastebud", TASTEBUD_VERSION), { recursive: true });
  writeFileSync(join(cache, "tastebud", TASTEBUD_VERSION, "tastebud"), script);
  chmodSync(join(cache, "tastebud", TASTEBUD_VERSION, "tastebud"), 0o755);
  return cache;
};

// Async, because the fake release is served from this same event loop.
const runScript = async (script: string, args: ReadonlyArray<string>, env: Record<string, string>, stdin = "") => {
  const child = Bun.spawn([script, ...args], {
    env: { PATH: process.env["PATH"] ?? "", HOME: makeTemporaryDirectory("plugin-home"), ...env },
    stdin: new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
};

test("the plugin, its marketplace and the README carry this release and the shared host lines", () => {
  const manifest = decodePluginManifest(readText(join(PLUGIN, ".claude-plugin/plugin.json")));
  expect(manifest).toMatchObject({ name: "tastebud", version: TASTEBUD_VERSION });
  const marketplace = decodeMarketplace(readText(join(REPO, ".claude-plugin/marketplace.json")));
  expect(marketplace.plugins.map(({ name, source }) => ({ name, source }))).toEqual([
    { name: "tastebud", source: "./plugins/tastebud" },
  ]);
  expect(agentHostConnectLinesFor().claudeCodePlugin).toContain(`install ${manifest.name} --marketplace`);

  // Edit the README to these exact lines when this fails after a version bump.
  const readme = readFileSync(join(REPO, "README.md"), "utf8");
  const { claudeCodePlugin, npxPrefetch, codex, mcpServersJson, cursorInstallLink, vscode } =
    agentHostConnectLinesFor();
  for (const line of [claudeCodePlugin, npxPrefetch, codex, mcpServersJson, cursorInstallLink, vscode])
    expect(readme).toContain(line);
});

test("the plugin's MCP server and hooks run commands the CLI has", () => {
  const servers = decodeMcpServers(readText(join(PLUGIN, ".mcp.json")));
  expect(servers.mcpServers).toEqual({ tastebud: { command: "${CLAUDE_PLUGIN_ROOT}/bin/tastebud", args: ["mcp"] } });
  const { hooks } = decodeHooks(readText(join(PLUGIN, "hooks/hooks.json")));
  const warmUp = hooks.SessionStart[0]?.hooks[0];
  expect(warmUp?.command).toStartWith('"${CLAUDE_PLUGIN_ROOT}/bin/tastebud" --version >/dev/null');
  expect(warmUp?.async).toBe(true);
  expect(hooks.UserPromptSubmit[0]?.hooks[0]?.command).toBe('"${CLAUDE_PLUGIN_ROOT}/hooks/prompt-hook.sh"');
  expect(readFileSync(PROMPT_HOOK, "utf8")).toContain('exec "$tastebud_binary" hook prompt\n');
  expect(readFileSync(PROMPT_HOOK, "utf8")).toContain(`/${TASTEBUD_CONFIG_FILE}" ]`);
  for (const args of [
    ["mcp", "--help"],
    ["hook", "prompt", "--help"],
    ["config-show", "--guide", "--help"],
    ["--version"],
  ])
    expect(Bun.spawnSync([...TASTEBUD_COMMAND_LINE, ...args], { stdout: "pipe", stderr: "pipe" }).exitCode).toBe(0);
});

test("bin/tastebud fetches its release once, checked against SHA256SUMS, then runs it offline", async () => {
  const release = await serveFakeRelease(FAKE_BINARY);
  const env = { XDG_CACHE_HOME: cacheWithBinary(undefined), TASTEBUD_INSTALL_BASE_URL: release.url };
  const first = await runScript(SHIM, ["mcp", "--store", "/tmp/a b"], env, "hello");
  await release.server.stop(true);
  // stdout carries only the binary's own output: under MCP it is the protocol stream.
  expect({ exitCode: first.exitCode, stdout: first.stdout }).toEqual({
    exitCode: 0,
    stdout: "ran mcp --store /tmp/a b <hello>\n",
  });
  expect((await runScript(SHIM, ["status"], env)).stdout).toBe("ran status <>\n");
  expect(release.fetched.archives).toBe(1);
});

test("TASTEBUD_BIN runs a checkout instead of the release, with no download, and must be a path", async () => {
  const work = makeTemporaryDirectory("plugin-dev-bin");
  const checkout = join(work, "tastebud");
  writeFileSync(checkout, FAKE_BINARY);
  chmodSync(checkout, 0o755);
  const unreachable = { XDG_CACHE_HOME: cacheWithBinary(undefined), TASTEBUD_INSTALL_BASE_URL: "http://127.0.0.1:9" };
  expect(await runScript(SHIM, ["status"], { ...unreachable, TASTEBUD_BIN: checkout })).toEqual({
    exitCode: 0,
    stdout: "ran status <>\n",
    stderr: "",
  });
  const bareName = await runScript(SHIM, ["--version"], { ...unreachable, TASTEBUD_BIN: "tastebud" });
  expect({ exitCode: bareName.exitCode, stdout: bareName.stdout }).toEqual({ exitCode: 1, stdout: "" });
  expect(bareName.stderr).toContain("must be a path");
});

test("the prompt hook starts tastebud only when it is on, a store exists and the binary is already there", async () => {
  const store = makeTemporaryDirectory("plugin-store");
  const noStore = join(store, "missing");
  writeFileSync(join(store, TASTEBUD_CONFIG_FILE), "export default {};\n");
  const withBinary = cacheWithBinary(FAKE_BINARY);
  const event = '{"prompt":"hi"}';
  const hook = (env: Record<string, string>) =>
    runScript(PROMPT_HOOK, [], { XDG_CACHE_HOME: withBinary, TASTEBUD_STORE: store, ...env }, event);

  expect(await hook({})).toEqual({ exitCode: 0, stdout: `ran hook prompt <${event}>\n`, stderr: "" });
  expect((await hook({ CLAUDE_PLUGIN_OPTION_PROMPT_HOOK: "true" })).stdout).toBe(`ran hook prompt <${event}>\n`);
  // As settings.json's env sets it: no shell has expanded the ~.
  const tildeStore = { HOME: dirname(store), TASTEBUD_STORE: `~/${basename(store)}` };
  expect((await hook(tildeStore)).stdout).toBe(`ran hook prompt <${event}>\n`);
  const silent = await Promise.all(
    [
      { CLAUDE_PLUGIN_OPTION_PROMPT_HOOK: "false" },
      { TASTEBUD_STORE: noStore },
      // No download on a prompt: with nothing cached and no release to reach, it is silent at once.
      { XDG_CACHE_HOME: cacheWithBinary(undefined), TASTEBUD_INSTALL_BASE_URL: "http://127.0.0.1:9" },
    ].map(hook),
  );
  for (const result of silent) expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
});

/** What the release archive holds: the compiled binary under TASTEBUD_TEST_BINARY, else a script running source. */
const releaseBinary = () => {
  const compiled = process.env["TASTEBUD_TEST_BINARY"];
  if (compiled) return readFileSync(compiled);
  return `#!/bin/sh\nexec ${TASTEBUD_COMMAND_LINE.map(shellQuotedWord).join(" ")} "$@"\n`;
};

test("one plugin install runs the loop: capture over its MCP server, propose, accept, then the hook recalls it", async () => {
  const release = await serveFakeRelease(releaseBinary());
  const store = await makeTestStore();
  const client = new Client({ name: "tastebud-plugin-test", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: SHIM,
      args: ["mcp"],
      env: tastebudProcessEnv({
        TASTEBUD_STORE: store,
        XDG_CACHE_HOME: makeTemporaryDirectory("plugin-loop-cache"),
        TASTEBUD_INSTALL_BASE_URL: release.url,
      }),
      cwd: makeTemporaryDirectory("plugin-loop-cwd"),
    }),
  );
  openClients.push(client);
  await release.server.stop(true);
  expect(client.getServerVersion()).toMatchObject({ name: "tastebud", version: TASTEBUD_VERSION });

  const repo = makeGitRepo("https://github.com/acme/web.git");
  const captured = await client.callTool({
    name: "capture",
    arguments: { said_by: "owner", quote: "Keep PRs under 300 lines.", in: repo },
  });
  const source = decodeCapturedSourceId(captured.structuredContent).source.source.id;
  // Curation runs through the CLI; in-process here, since test/cli.test.ts covers the commands.
  const proposed = await runOperation(
    store,
    "propose",
    { kind: "belief", statement: "Keep pull requests small", supports: [source] },
    await callerFor(store, { cwd: repo }),
  );
  // The owner's accept, as the review UI sends it; test/review.test.ts covers that page itself.
  await runOperation(
    store,
    "decide",
    { ref: proposed.derivation.id, outcome: "accept" },
    { via: "review", context: { places: [], origin: "unknown" } },
  );

  const preview = await runOperation(
    store,
    "hook-preview",
    { prompt: "open the pull requests", in: repo },
    await callerFor(store, { cwd: repo }),
  );
  expect(preview.additionalContext).toContain("Keep pull requests small");
  expect(release.fetched.archives).toBe(1);
});
