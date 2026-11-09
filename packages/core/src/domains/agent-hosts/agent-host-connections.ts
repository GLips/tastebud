/**
 * Whether each agent host is wired to a given store, judged from the host's own config file as already
 * read and parsed. "Can't tell" (`unknown`) stays apart from "not connected": a file that doesn't parse,
 * or an entry whose store comes from the host's environment, is not evidence of absence.
 */
import { Schema } from "effect";

export const AGENT_HOSTS = ["claude-code", "codex", "cursor", "vscode", "other-mcp"] as const;
export type AgentHost = (typeof AGENT_HOSTS)[number];
const AgentHostSchema = Schema.Literals(AGENT_HOSTS);

export const AgentHostConnectionSchema = Schema.Union([
  Schema.Struct({ host: AgentHostSchema, configPath: Schema.String, state: Schema.Literal("connected") }),
  Schema.Struct({
    host: AgentHostSchema,
    configPath: Schema.String,
    state: Schema.Literal("not-connected"),
    /** `no-config`: the host's config file doesn't exist; `no-entry`: it names no Tastebud plugin or server. */
    reason: Schema.Literals(["no-config", "no-entry"]),
  }),
  Schema.Struct({
    host: AgentHostSchema,
    configPath: Schema.String,
    state: Schema.Literal("not-connected"),
    reason: Schema.Literal("other-store"),
    otherStore: Schema.String,
  }),
  Schema.Struct({
    host: AgentHostSchema,
    configPath: Schema.String,
    state: Schema.Literal("unknown"),
    /** `store-from-environment`: Tastebud is there but names no store, so the host's environment picks it. */
    reason: Schema.Literals(["unreadable", "store-from-environment"]),
  }),
  /** A host whose config Tastebud doesn't know how to find, such as an arbitrary MCP client. */
  Schema.Struct({ host: AgentHostSchema, state: Schema.Literal("unknown"), reason: Schema.Literal("not-checked") }),
]);
export type AgentHostConnection = typeof AgentHostConnectionSchema.Type;

/** A host config file as infrastructure found it: absent, present but not readable as `A`, or decoded. */
export type AgentHostConfigFile<A> =
  | { readonly found: "missing" }
  | { readonly found: "unreadable" }
  | { readonly found: "parsed"; readonly value: A };

/** The store being checked for, and how a `~/` or unnamed store in a host's config resolves. */
export interface AgentHostStoreTarget {
  readonly storeRoot: string;
  /** `~/.tastebud` expanded: where an entry naming no store, in an environment naming none, points. */
  readonly defaultStoreRoot: string;
  readonly home: string;
}

const McpServerEntrySchema = Schema.Struct({
  command: Schema.optionalKey(Schema.String),
  args: Schema.optionalKey(Schema.Array(Schema.String)),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
type McpServerEntry = typeof McpServerEntrySchema.Type;
const McpServersSchema = Schema.Record(Schema.String, McpServerEntrySchema);

/** The part of an MCP host's config naming its servers, under whichever key that host uses. */
export const McpHostConfigSchema = Schema.Struct({
  mcpServers: Schema.optionalKey(McpServersSchema),
  mcp_servers: Schema.optionalKey(McpServersSchema),
  servers: Schema.optionalKey(McpServersSchema),
});
type McpHostConfig = typeof McpHostConfigSchema.Type;

/** The part of Claude Code's settings.json that enables the plugin and can name its store. */
export const ClaudeCodeSettingsSchema = Schema.Struct({
  enabledPlugins: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  env: Schema.optionalKey(Schema.Struct({ TASTEBUD_STORE: Schema.optionalKey(Schema.String) })),
});
type ClaudeCodeSettings = typeof ClaudeCodeSettingsSchema.Type;

const comparablePath = (path: string, home: string) =>
  (path === "~" || path.startsWith("~/") ? `${home}${path.slice(1)}` : path).replace(/(.)\/+$/, "$1");

/** The store an entry names: `--store <root>` or `--store=<root>` in its args, else its `TASTEBUD_STORE`. */
const namedStoreOf = (entry: McpServerEntry): string | undefined => {
  const args = entry.args ?? [];
  const flagAt = args.indexOf("--store");
  const inline = args.find((arg) => arg.startsWith("--store="));
  return (flagAt >= 0 ? args[flagAt + 1] : inline?.slice("--store=".length)) ?? entry.env?.["TASTEBUD_STORE"];
};

const isTastebudServer = (name: string, entry: McpServerEntry) =>
  name === "tastebud" ||
  entry.command?.split("/").at(-1) === "tastebud" ||
  (entry.args ?? []).some((arg) => arg === "tastebud" || arg.startsWith("tastebud@"));

/** The verdict for a host where Tastebud is present, from the store each of its entries names (or none). */
const storeConnectionOf = (
  host: AgentHost,
  configPath: string,
  namedStores: ReadonlyArray<string | undefined>,
  target: AgentHostStoreTarget,
): AgentHostConnection => {
  const ours = comparablePath(target.storeRoot, target.home);
  const named = namedStores.flatMap((store) => (store === undefined ? [] : [comparablePath(store, target.home)]));
  const unnamed = named.length < namedStores.length;
  const isDefault = ours === comparablePath(target.defaultStoreRoot, target.home);
  if (named.includes(ours) || (unnamed && isDefault)) return { host, configPath, state: "connected" };
  const [otherStore] = named;
  if (unnamed || otherStore === undefined) {
    return { host, configPath, state: "unknown", reason: "store-from-environment" };
  }
  return { host, configPath, state: "not-connected", reason: "other-store", otherStore };
};

/**
 * A host that runs Tastebud as an MCP server: Codex (`mcp_servers` in config.toml), Cursor (`mcpServers` in
 * mcp.json), VS Code (`servers` in its user mcp.json). `serversKey` names the record holding the servers.
 */
export const mcpHostConnectionOf = (
  host: AgentHost,
  configPath: string,
  file: AgentHostConfigFile<McpHostConfig>,
  serversKey: keyof McpHostConfig,
  target: AgentHostStoreTarget,
): AgentHostConnection => {
  if (file.found === "missing") return { host, configPath, state: "not-connected", reason: "no-config" };
  if (file.found === "unreadable") return { host, configPath, state: "unknown", reason: "unreadable" };
  const servers = Object.entries(file.value[serversKey] ?? {}).flatMap(([name, entry]) =>
    isTastebudServer(name, entry) ? [entry] : [],
  );
  if (servers.length === 0) return { host, configPath, state: "not-connected", reason: "no-entry" };
  return storeConnectionOf(host, configPath, servers.map(namedStoreOf), target);
};

/**
 * Claude Code runs Tastebud as its plugin (`tastebud@<marketplace>` enabled in settings.json), which reads
 * its store from `TASTEBUD_STORE` in the same file's `env`, or else from the environment Claude Code runs in.
 */
export const claudeCodeConnectionOf = (
  configPath: string,
  file: AgentHostConfigFile<ClaudeCodeSettings>,
  target: AgentHostStoreTarget,
): AgentHostConnection => {
  const host = "claude-code";
  if (file.found === "missing") return { host, configPath, state: "not-connected", reason: "no-config" };
  if (file.found === "unreadable") return { host, configPath, state: "unknown", reason: "unreadable" };
  const enabled = Object.entries(file.value.enabledPlugins ?? {}).some(
    ([key, on]) => key.startsWith("tastebud@") && on === true,
  );
  if (!enabled) return { host, configPath, state: "not-connected", reason: "no-entry" };
  return storeConnectionOf(host, configPath, [file.value.env?.TASTEBUD_STORE], target);
};
