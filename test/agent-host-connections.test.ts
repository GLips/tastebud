/** The Settings connection readout: each host's config, as read, judged against the store under review. */
import { expect, test } from "bun:test";

import { claudeCodeConnectionOf, mcpHostConnectionOf } from "@tastebud/core/agent-hosts";

const settings = (env: Record<string, string>) => ({
  found: "parsed" as const,
  value: { enabledPlugins: { "tastebud@tastebud": true }, env },
});
const config = (args: ReadonlyArray<string>) => ({
  found: "parsed" as const,
  value: { mcpServers: { other: {}, taste: { command: "npx", args } } },
});
const target = { storeRoot: "/work/store", defaultStoreRoot: "/home/dana/.tastebud", home: "/home/dana" };

test("Claude Code is connected only when its plugin is on and its settings point at this store", () => {
  expect(claudeCodeConnectionOf("s.json", settings({ TASTEBUD_STORE: "/work/store/" }), target).state).toBe(
    "connected",
  );
  expect(claudeCodeConnectionOf("s.json", settings({ TASTEBUD_STORE: "~/other" }), target)).toMatchObject({
    state: "not-connected",
    reason: "other-store",
    otherStore: "/home/dana/other",
  });
  // No store named, and this isn't the default store: the shell Claude Code runs in decides.
  expect(claudeCodeConnectionOf("s.json", settings({}), target)).toMatchObject({
    state: "unknown",
    reason: "store-from-environment",
  });
  expect(
    claudeCodeConnectionOf("s.json", { found: "parsed", value: { enabledPlugins: { "tastebud@x": false } } }, target),
  ).toMatchObject({ state: "not-connected", reason: "no-entry" });
});

test("an MCP host finds Tastebud by what it runs and reads the store from --store", () => {
  expect(
    mcpHostConnectionOf(
      "cursor",
      "mcp.json",
      config(["-y", "tastebud@0.2.0", "mcp", "--store", "/work/store"]),
      "mcpServers",
      target,
    ).state,
  ).toBe("connected");
  expect(
    mcpHostConnectionOf(
      "cursor",
      "mcp.json",
      config(["-y", "tastebud@0.2.0", "mcp", "--store=/elsewhere"]),
      "mcpServers",
      target,
    ),
  ).toMatchObject({ state: "not-connected", reason: "other-store", otherStore: "/elsewhere" });
  expect(mcpHostConnectionOf("cursor", "mcp.json", config(["-y", "prettier"]), "mcpServers", target)).toMatchObject({
    state: "not-connected",
    reason: "no-entry",
  });
});

test("a missing config is not connected, but one that won't parse is can't tell", () => {
  expect(mcpHostConnectionOf("codex", "config.toml", { found: "missing" }, "mcp_servers", target)).toMatchObject({
    state: "not-connected",
    reason: "no-config",
  });
  expect(mcpHostConnectionOf("codex", "config.toml", { found: "unreadable" }, "mcp_servers", target)).toMatchObject({
    state: "unknown",
    reason: "unreadable",
  });
});
