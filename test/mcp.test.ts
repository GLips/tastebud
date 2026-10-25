/** The MCP server over real stdio, driven by the SDK client as an agent host would. */
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Schema } from "effect";

import { listTasteOperations, mcpToolNameOf } from "../src/core/index.ts";
import { makeGitRepo, makeTestStore, OWNER } from "./support.ts";

const decodeCapturedSourceId = Schema.decodeUnknownSync(
  Schema.Struct({ source: Schema.Struct({ source: Schema.Struct({ id: Schema.String }) }) }),
);

const MAIN = join(import.meta.dir, "../src/cli/main.ts");

const openClients: Array<Client> = [];
afterEach(async () => {
  await Promise.all(openClients.splice(0).map((client) => client.close()));
});

const connectTasteMcp = async (store: string) => {
  const client = new Client({ name: "taste-test", version: "1.0.0" });
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  await client.connect(
    new StdioClientTransport({ command: "bun", args: [MAIN, "mcp"], env: { ...env, TASTE_STORE: store } }),
  );
  openClients.push(client);
  return client;
};

test("tools/list holds exactly the agent operations, with strict schemas", async () => {
  const client = await connectTasteMcp(await makeTestStore());
  const { tools } = await client.listTools();
  const expected = listTasteOperations("agent").map((operation) => mcpToolNameOf(operation.name));
  expect(tools.map((tool) => tool.name).toSorted()).toEqual(expected.toSorted());
  expect(tools.map((tool) => tool.name)).not.toContain("taste_decide");

  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  expect(byName.get("taste_reindex")?.inputSchema).toEqual({
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  const propose = byName.get("taste_propose")?.inputSchema;
  expect(propose?.additionalProperties).toBe(false);
  expect(propose?.properties?.in).toMatchObject({
    type: "string",
    description: expect.stringContaining("working directory"),
  });
  expect(JSON.stringify(tools)).not.toContain('"null"');
});

test("capture, propose and recall work from an `in` directory; bad input is an error result", async () => {
  const client = await connectTasteMcp(await makeTestStore());
  const repo = makeGitRepo("https://github.com/acme/web.git");

  const captured = await client.callTool({
    name: "taste_capture",
    arguments: { said_by: OWNER, said_by_label: "Tess", quote: "Keep PRs under 300 lines.", in: repo },
  });
  expect(captured.isError).toBeFalsy();
  const sourceId = decodeCapturedSourceId(captured.structuredContent).source.source.id;

  const proposed = await client.callTool({
    name: "taste_propose",
    arguments: { kind: "belief", statement: "Keep pull requests small", supports: [sourceId], in: repo },
  });
  expect(proposed.isError).toBeFalsy();
  expect(proposed.structuredContent).toMatchObject({
    derivation: { proposedScope: { scope: "places", places: ["github.com/acme/web::"] } },
  });

  const recalled = await client.callTool({ name: "taste_recall", arguments: { query: "pull requests", in: repo } });
  expect(recalled.structuredContent).toMatchObject({ context: { origin: "in", places: ["github.com/acme/web::"] } });

  // No `in` and no roots: unknown context, so a proposal must name its scope.
  const unscoped = await client.callTool({
    name: "taste_propose",
    arguments: { kind: "belief", statement: "Squash merge every branch", supports: [sourceId] },
  });
  expect(unscoped.isError).toBe(true);

  const invalid = await client.callTool({ name: "taste_recall", arguments: { query: "x", bogus: true } });
  expect(invalid).toMatchObject({
    isError: true,
    content: [{ type: "text", text: expect.stringContaining("bogus") }],
    structuredContent: { error: { tag: "InvalidTasteInput", category: "input" } },
  });
});
