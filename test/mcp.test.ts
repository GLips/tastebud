/** The MCP server over real stdio, driven by the SDK client as an agent host would. */
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { TASTEBUD_VERSION } from "@tastebud/core/taste-vocabulary";
import { Schema } from "effect";

import {
  makeGitRepo,
  makeTemporaryDirectory,
  makeTestStore,
  OWNER,
  runTastebud,
  TASTEBUD_COMMAND_LINE,
  tastebudProcessEnv,
} from "./support.ts";

const decodeCapturedSourceId = Schema.decodeUnknownSync(
  Schema.Struct({ source: Schema.Struct({ source: Schema.Struct({ id: Schema.String }) }) }),
);

const openClients: Array<Client> = [];
afterEach(async () => {
  await Promise.all(openClients.splice(0).map((client) => client.close()));
});

const connectTastebudMcp = async (store: string) => {
  const client = new Client({ name: "tastebud-test", version: "1.0.0" });
  const [command = "", ...leading] = TASTEBUD_COMMAND_LINE;
  await client.connect(
    new StdioClientTransport({
      command,
      args: [...leading, "mcp"],
      env: tastebudProcessEnv({ TASTEBUD_STORE: store }),
      // Outside the checkout, so the release smoke run can't lean on workspace files.
      cwd: makeTemporaryDirectory("mcp-cwd"),
    }),
  );
  openClients.push(client);
  return client;
};

test("the server and `tastebud --version` both report TASTEBUD_VERSION", async () => {
  const store = await makeTestStore();
  const client = await connectTastebudMcp(store);
  expect(client.getServerVersion()).toMatchObject({ name: "tastebud", version: TASTEBUD_VERSION });
  const printed = await runTastebud(store, makeTemporaryDirectory("version"), ["--version"]);
  expect(printed.stdout.trim()).toEndWith(TASTEBUD_VERSION);
});

test("tools/list is capture alone, with a strict schema, and no other name runs", async () => {
  const client = await connectTastebudMcp(await makeTestStore());
  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name)).toEqual(["capture"]);
  const capture = tools[0]?.inputSchema;
  expect(capture?.additionalProperties).toBe(false);
  expect(capture?.required?.toSorted()).toEqual(["quote", "said_by"]);
  expect(JSON.stringify(capture?.properties?.in)).toContain("only when you actually know it");
  expect(JSON.stringify(tools)).not.toContain('"null"');

  // An agent operation still in the registry, and the old prefixed name, are both refused.
  const names = ["recall", "tastebud_capture"];
  const refusals = await Promise.all(names.map((name) => client.callTool({ name, arguments: { query: "x" } })));
  expect(
    refusals.map((refused, index) => [refused.isError, JSON.stringify(refused.content).includes(names[index]!)]),
  ).toEqual([
    [true, true],
    [true, true],
  ]);
});

test("capture needs no lookup first: owner words land as the conversation kind, others need a label", async () => {
  const store = await makeTestStore();
  const client = await connectTastebudMcp(store);
  const repo = makeGitRepo("https://github.com/acme/web.git");

  const captured = await client.callTool({
    name: "capture",
    arguments: {
      said_by: "owner",
      quote: "Keep PRs under 300 lines.",
      before: "Agent: I'll open one PR with the whole refactor.",
      in: repo,
    },
  });
  expect(captured.isError).toBeFalsy();
  expect(captured.structuredContent).toMatchObject({
    source: {
      source: { kind: "memory", said_by: OWNER, said_by_label: "tester", captured_in: ["github.com/acme/web::"] },
    },
  });
  // Without a working directory the words are still kept, just with no place.
  const placeless = await client.callTool({ name: "capture", arguments: { said_by: "owner", quote: "Tabs." } });
  expect(placeless.isError).toBeFalsy();
  decodeCapturedSourceId(placeless.structuredContent);

  const unlabelled = await client.callTool({
    name: "capture",
    arguments: { said_by: "human:dana", quote: "Ship it Friday." },
  });
  expect(unlabelled).toMatchObject({
    isError: true,
    structuredContent: { error: { tag: "InvalidTasteInput", category: "input" } },
  });
  expect(JSON.stringify(unlabelled.content)).toContain("said_by_label");

  const invalid = await client.callTool({ name: "capture", arguments: { said_by: "owner", quote: "x", bogus: true } });
  expect(JSON.stringify(invalid.content)).toContain("bogus");
});

test("with no store, capture sends the agent to setup through the CLI", async () => {
  const store = join(makeTemporaryDirectory("setup"), "store");
  const client = await connectTastebudMcp(store);
  const missing = await client.callTool({ name: "capture", arguments: { said_by: "owner", quote: "Tabs." } });
  expect(missing.isError).toBe(true);
  expect(JSON.stringify(missing.content)).toContain("`tastebud config-show --guide`");
  expect(existsSync(store)).toBe(false);
});
