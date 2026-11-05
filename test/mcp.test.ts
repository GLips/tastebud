/** The MCP server over real stdio, driven by the SDK client as an agent host would. */
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { listTasteOperations, mcpToolNameOf } from "@tastebud/core/operations";
import { TASTEBUD_VERSION } from "@tastebud/core/taste-vocabulary";
import { Schema } from "effect";

import {
  demoConfigText,
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

test("tools/list holds exactly the agent operations, with strict schemas", async () => {
  const client = await connectTastebudMcp(await makeTestStore());
  const { tools } = await client.listTools();
  const expected = listTasteOperations("agent").map((operation) => mcpToolNameOf(operation.name));
  expect(tools.map((tool) => tool.name).toSorted()).toEqual(expected.toSorted());
  expect(tools.map((tool) => tool.name)).not.toContain("tastebud_decide");

  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  expect(byName.get("tastebud_reindex")?.inputSchema).toEqual({
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  const propose = byName.get("tastebud_propose")?.inputSchema;
  expect(propose?.additionalProperties).toBe(false);
  expect(propose?.properties?.in).toMatchObject({ type: "string" });
  expect(JSON.stringify(propose?.properties?.in)).toContain("working directory");
  expect(JSON.stringify(tools)).not.toContain('"null"');
});

test("capture, propose and recall work from an `in` directory; bad input is an error result", async () => {
  const client = await connectTastebudMcp(await makeTestStore());
  const repo = makeGitRepo("https://github.com/acme/web.git");

  const captured = await client.callTool({
    name: "tastebud_capture",
    arguments: { said_by: OWNER, said_by_label: "Tess", quote: "Keep PRs under 300 lines.", in: repo },
  });
  expect(captured.isError).toBeFalsy();
  const sourceId = decodeCapturedSourceId(captured.structuredContent).source.source.id;

  const proposed = await client.callTool({
    name: "tastebud_propose",
    arguments: { kind: "belief", statement: "Keep pull requests small", supports: [sourceId], in: repo },
  });
  expect(proposed.isError).toBeFalsy();
  expect(proposed.structuredContent).toMatchObject({
    derivation: { proposedScope: { scope: "places", places: ["github.com/acme/web::"] } },
  });

  const recalled = await client.callTool({ name: "tastebud_recall", arguments: { query: "pull requests", in: repo } });
  expect(recalled.structuredContent).toMatchObject({ context: { origin: "in", places: ["github.com/acme/web::"] } });

  // No `in` and no roots: unknown context, so a proposal must name its scope.
  const unscoped = await client.callTool({
    name: "tastebud_propose",
    arguments: { kind: "belief", statement: "Squash merge every branch", supports: [sourceId] },
  });
  expect(unscoped.isError).toBe(true);

  const invalid = await client.callTool({ name: "tastebud_recall", arguments: { query: "x", bogus: true } });
  expect(invalid).toMatchObject({
    isError: true,
    structuredContent: { error: { tag: "InvalidTasteInput", category: "input" } },
  });
  expect(JSON.stringify(invalid.content)).toContain("bogus");
});

test("setup over MCP: the setup prompt, a check that writes nothing, then a write that creates the store", async () => {
  const store = join(makeTemporaryDirectory("setup"), "store");
  const client = await connectTastebudMcp(store);
  const { prompts } = await client.listPrompts();
  expect(prompts.map((prompt) => prompt.name)).toEqual(["setup"]);
  const setup = await client.getPrompt({ name: "setup" });
  expect(JSON.stringify(setup.messages)).toContain("config-show");

  const missing = await client.callTool({ name: "tastebud_catalog", arguments: {} });
  expect(missing.isError).toBe(true);
  expect(JSON.stringify(missing.content)).toContain("`setup` prompt");

  const bad = demoConfigText(`"git"`).replace(`sources: ["memory"]`, `sources: ["chat"]`);
  const checked = await client.callTool({ name: "tastebud_config_check", arguments: { text: bad } });
  expect(checked.structuredContent).toMatchObject({
    valid: false,
    createsStore: true,
    problems: [`derivedKinds.belief.sources: "chat" is not a source kind`],
  });
  expect(existsSync(store)).toBe(false);

  const written = await client.callTool({
    name: "tastebud_config_write",
    arguments: { text: demoConfigText(`"git"`), expected_current: "" },
  });
  expect(written.structuredContent).toMatchObject({ created: true, loaded: { catalog: { owner: OWNER } } });
  const catalog = await client.callTool({ name: "tastebud_catalog", arguments: {} });
  expect(catalog.isError).toBeFalsy();
});
