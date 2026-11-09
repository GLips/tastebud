/** `hosts`: which agent hosts have Tastebud wired to this store, read from each host's own config. Writes nothing. */
import { Effect, Schema } from "effect";

import {
  type AgentHostConnection,
  AgentHostConnectionSchema,
  claudeCodeConnectionOf,
  ClaudeCodeSettingsSchema,
  mcpHostConnectionOf,
  McpHostConfigSchema,
} from "#core/domains/agent-hosts/index.ts";
import { TasteStoreRoot } from "#core/features/record-store/index.server.ts";
import { agentHostConfigPaths, readAgentHostConfigFile } from "#core/infrastructure/agent-host-config-files.ts";
import { resolveStoreRoot } from "#core/infrastructure/store-root.ts";

export const AgentHostConnectionsResultSchema = Schema.Struct({
  /** The home directory the config paths sit under, so a reader can show them as `~/…`. */
  home: Schema.String,
  /** One per host, in AGENT_HOSTS order. */
  connections: Schema.Array(AgentHostConnectionSchema),
});
export type AgentHostConnectionsResult = typeof AgentHostConnectionsResultSchema.Type;

const notChecked = (host: "vscode" | "other-mcp"): AgentHostConnection => ({
  host,
  state: "unknown",
  reason: "not-checked",
});

export const readAgentHostConnections = Effect.fn("store-setup.readAgentHostConnections")(function* () {
  const { root } = yield* TasteStoreRoot;
  const paths = agentHostConfigPaths();
  const target = { storeRoot: root, defaultStoreRoot: resolveStoreRoot({}), home: paths.home };
  const mcpHost = (
    host: "codex" | "cursor" | "vscode",
    path: string,
    format: "json" | "toml",
    serversKey: keyof typeof McpHostConfigSchema.Type,
  ) =>
    Effect.map(readAgentHostConfigFile(path, format, McpHostConfigSchema), (file) =>
      mcpHostConnectionOf(host, path, file, serversKey, target),
    );
  const connections = yield* Effect.all([
    Effect.map(readAgentHostConfigFile(paths.claudeCodeSettings, "json", ClaudeCodeSettingsSchema), (file) =>
      claudeCodeConnectionOf(paths.claudeCodeSettings, file, target),
    ),
    mcpHost("codex", paths.codexConfig, "toml", "mcp_servers"),
    mcpHost("cursor", paths.cursorMcp, "json", "mcpServers"),
    paths.vscodeMcp === undefined
      ? Effect.succeed(notChecked("vscode"))
      : mcpHost("vscode", paths.vscodeMcp, "json", "servers"),
    Effect.succeed(notChecked("other-mcp")),
  ]);
  const result: AgentHostConnectionsResult = { home: paths.home, connections };
  return result;
});

const STATE_WORDS = { connected: "connected", "not-connected": "not connected", unknown: "can't tell" } as const;

export const renderAgentHostConnectionsText = ({ connections }: AgentHostConnectionsResult) =>
  connections
    .map((connection) => {
      const why = "reason" in connection ? ` (${connection.reason})` : "";
      const where = "configPath" in connection ? ` · ${connection.configPath}` : "";
      return `${connection.host}: ${STATE_WORDS[connection.state]}${why}${where}`;
    })
    .join("\n");
