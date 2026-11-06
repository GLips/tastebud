/**
 * The lines that connect each agent host to Tastebud: the one source for the README's install section,
 * the setup interview's wiring step and the review UI's Settings page. Claude Code gets the plugin, which
 * downloads its own binary. Other hosts run the npm package through npx, pinned to this release, so
 * registering needs Node but no install first.
 */
import { TASTEBUD_VERSION } from "#core/domains/taste-vocabulary/index.ts";

/**
 * The marketplace is this repo; the plugin and the marketplace are both named `tastebud`. `--config` sets
 * the manifest's default explicitly, because without it the install reports `prompt_hook` as unset.
 */
export const TASTEBUD_PLUGIN_INSTALL_COMMAND =
  "claude plugin install tastebud --marketplace GLips/tastebud --config prompt_hook=true";

export interface AgentHostConnectLines {
  /** A shell line; `/plugin install tastebud --marketplace GLips/tastebud` is the same inside Claude Code. */
  readonly claudeCodePlugin: string;
  /** The `~/.claude/settings.json` entry that points the plugin at a store; absent for the default store. */
  readonly claudeCodeStoreSettings?: string;
  /**
   * Run once before registering an npx host: it downloads the binary in a terminal, where a failure shows,
   * instead of inside the host's first MCP start and its startup timeout.
   */
  readonly npxPrefetch: string;
  readonly codex: string;
  /** `~/.cursor/mcp.json`, and the JSON any other MCP client (Claude Desktop, Windsurf, …) takes. */
  readonly mcpServersJson: string;
  /** Opens Cursor's "install MCP server" dialog with the same server. */
  readonly cursorInstallLink: string;
  readonly vscode: string;
}

// Characters a POSIX shell word can hold unquoted.
const SHELL_SAFE_WORD = /^[\w./~:@=+-]+$/;

/** Single-quoted when needed, so `$`, spaces and quotes in a path reach the program as typed. */
export const shellQuotedWord = (word: string) =>
  SHELL_SAFE_WORD.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;

// btoa takes Latin-1 only, so a store path with other characters goes through its UTF-8 bytes.
const base64OfText = (text: string) => btoa(String.fromCodePoint(...new TextEncoder().encode(text)));

/**
 * Every host's line for the store at `storeRoot`, or for the default store (`~/.tastebud`) when it is
 * undefined. Pass a placeholder such as `<root>` to print a template.
 */
export const agentHostConnectLinesFor = (storeRoot?: string): AgentHostConnectLines => {
  const args = [
    "-y",
    `tastebud@${TASTEBUD_VERSION}`,
    "mcp",
    ...(storeRoot === undefined ? [] : ["--store", storeRoot]),
  ];
  const server = { command: "npx", args };
  const commandLine = ["npx", ...args].map(shellQuotedWord).join(" ");
  const lines: AgentHostConnectLines = {
    claudeCodePlugin: TASTEBUD_PLUGIN_INSTALL_COMMAND,
    npxPrefetch: `npx -y tastebud@${TASTEBUD_VERSION} --version`,
    codex: `codex mcp add tastebud -- ${commandLine}`,
    mcpServersJson: JSON.stringify({ mcpServers: { tastebud: server } }),
    cursorInstallLink: `https://cursor.com/en/install-mcp?name=tastebud&config=${encodeURIComponent(base64OfText(JSON.stringify(server)))}`,
    vscode: `code --add-mcp ${shellQuotedWord(JSON.stringify({ name: "tastebud", type: "stdio", ...server }))}`,
  };
  if (storeRoot === undefined) return lines;
  return { ...lines, claudeCodeStoreSettings: JSON.stringify({ env: { TASTEBUD_STORE: storeRoot } }) };
};
