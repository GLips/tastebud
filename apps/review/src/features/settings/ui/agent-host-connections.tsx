import { Anchor, Badge, Box, Button, Collapse, Paper, Skeleton, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import {
  AGENT_HOSTS,
  type AgentHost,
  type AgentHostConnectLines,
  type AgentHostConnection,
  agentHostConnectLinesFor,
} from "@tastebud/core/agent-hosts";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";

import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import { CopyableSnippet } from "./copyable-snippet.tsx";
import { agentHostConnectionsQuery } from "./settings-queries.ts";

const styles = stylex.create({
  // Host · what it gets · state · action, one grid so every row's columns line up.
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) 120px 112px",
    columnGap: "16px",
    alignItems: "center",
    paddingBlock: "12px",
    paddingInline: "16px",
  },
  divided: { borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "var(--mantine-color-gray-2)" },
  steps: { margin: 0, listStyle: "none", paddingTop: 0, paddingInline: "16px", paddingBottom: "16px" },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(180deg)" },
  action: { justifySelf: "end" },
});

const HOST_NAMES: Record<AgentHost, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  vscode: "VS Code",
  "other-mcp": "Other MCP client",
};

/** What each host gets: only Claude Code's plugin has the prompt hook and /tastebud:review. */
const HOST_GETS: Record<AgentHost, string> = {
  "claude-code": "Prompt hook · capture · review",
  codex: "Capture · recall",
  cursor: "Capture · recall",
  vscode: "Capture · recall",
  "other-mcp": "Capture · recall",
};

const STATE_BADGES = {
  connected: { label: "Connected", color: "tastebud" },
  "not-connected": { label: "Not connected", color: "gray" },
  unknown: { label: "Can't tell", color: "yellow" },
} as const satisfies Record<AgentHostConnection["state"], { label: string; color: string }>;

/** `~/…` for paths under home, so the tooltip reads like the files the owner knows. */
const tildePath = (path: string, home: string | undefined) =>
  home !== undefined && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;

/** The badge's tooltip: why a host reads as it does, naming the file or store that decided it. */
const connectionWhy = (connection: AgentHostConnection, home: string | undefined): string => {
  const where = "configPath" in connection ? tildePath(connection.configPath, home) : "";
  if (connection.state === "connected") return `Set in ${where}`;
  switch (connection.reason) {
    case "no-config":
      return `No ${where}`;
    case "no-entry":
      return `No Tastebud entry in ${where}`;
    case "other-store":
      return `Points at another store: ${tildePath(connection.otherStore, home)}`;
    case "unreadable":
      return `${where} doesn't parse`;
    case "store-from-environment":
      return `Tastebud is in ${where} but names no store, so the environment the host starts in picks it`;
    case "not-checked":
      return "Tastebud can't see this host's config";
  }
};

/** The JSON lines from `agentHostConnectLinesFor`, laid out to read in a snippet. */
const prettyJson = (json: string) => JSON.stringify(JSON.parse(json), null, 2);

interface ConnectStep {
  readonly title: ReactNode;
  readonly code: string;
  readonly label: string;
}

/** The steps that connect a host to this store, in order. */
function connectStepsOf(host: AgentHost, lines: AgentHostConnectLines): ReadonlyArray<ConnectStep> {
  // Hosts other than Claude Code run the npm package through npx; this downloads it once, where errors show.
  const prefetch: ConnectStep = {
    title: "Download once, in a terminal (needs Node)",
    code: lines.npxPrefetch,
    label: "npx prefetch command",
  };
  switch (host) {
    case "claude-code":
      return [
        { title: "Install the plugin", code: lines.claudeCodePlugin, label: "Claude Code plugin install" },
        ...(lines.claudeCodeStoreSettings === undefined
          ? []
          : [
              {
                title: "Point it at this store, in ~/.claude/settings.json",
                code: prettyJson(lines.claudeCodeStoreSettings),
                label: "Claude Code store setting",
              },
            ]),
      ];
    case "codex":
      return [prefetch, { title: "Register the server", code: lines.codex, label: "Codex command" }];
    case "cursor":
      return [
        prefetch,
        {
          title: (
            <>
              Add to ~/.cursor/mcp.json, or{" "}
              <Anchor href={lines.cursorInstallLink} target="_blank" rel="noreferrer" size="sm">
                Add to Cursor
              </Anchor>
            </>
          ),
          code: prettyJson(lines.mcpServersJson),
          label: "Cursor MCP config",
        },
      ];
    case "vscode":
      return [prefetch, { title: "Register the server", code: lines.vscode, label: "VS Code command" }];
    case "other-mcp":
      return [
        prefetch,
        { title: "Add to the client's MCP config", code: prettyJson(lines.mcpServersJson), label: "MCP config" },
      ];
  }
}

function ConnectSteps({ steps }: { steps: ReadonlyArray<ConnectStep> }) {
  return (
    <Stack gap="sm" component="ol" {...stylex.props(styles.steps)}>
      {steps.map((step, index) => (
        <Stack key={step.label} gap="2xs" component="li" miw={0}>
          <Text size="sm">
            <Text span size="sm" c="dimmed">
              {index + 1}.{" "}
            </Text>
            {step.title}
          </Text>
          <CopyableSnippet code={step.code} label={step.label} />
        </Stack>
      ))}
    </Stack>
  );
}

function AgentHostRow({
  host,
  connection,
  home,
  lines,
  divided,
}: {
  host: AgentHost;
  /** Undefined while the readout loads. */
  connection: AgentHostConnection | undefined;
  home: string | undefined;
  lines: AgentHostConnectLines;
  divided: boolean;
}) {
  const [open, setOpen] = useState(false);
  const badge = connection === undefined ? undefined : STATE_BADGES[connection.state];
  return (
    <Box {...stylex.props(divided && styles.divided)}>
      <Box {...stylex.props(styles.row)}>
        <Text size="sm" fw={500}>
          {HOST_NAMES[host]}
        </Text>
        <SupportingText tier="secondary">{HOST_GETS[host]}</SupportingText>
        {connection === undefined || badge === undefined ? (
          <Skeleton height={20} width={90} />
        ) : (
          <Tooltip label={connectionWhy(connection, home)} withArrow multiline maw={320} openDelay={150}>
            <Badge color={badge.color} tt="none" fw={500} w="fit-content">
              {badge.label}
            </Badge>
          </Tooltip>
        )}
        <Button
          variant="subtle"
          color="gray"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          rightSection={<ChevronDown size={14} {...stylex.props(styles.chevron, open && styles.chevronOpen)} />}
          {...stylex.props(styles.action)}
        >
          {connection?.state === "connected" ? "Details" : "Connect"}
        </Button>
      </Box>
      <Collapse expanded={open}>
        <ConnectSteps steps={connectStepsOf(host, lines)} />
      </Collapse>
    </Box>
  );
}

/** One row per agent host: whether its own config wires Tastebud to this store, and the lines that do. */
export function AgentHostConnections({ storeRoot }: { storeRoot: string | undefined }) {
  const readout = useQuery(agentHostConnectionsQuery);
  const lines = agentHostConnectLinesFor(storeRoot);
  const home = readout.data?.home;
  return (
    <Stack gap="sm" component="section" aria-label="Connections">
      <Text fw={600}>Connections</Text>
      {readout.error !== null && <QueryErrorAlert error={readout.error} />}
      <Paper p={0}>
        {AGENT_HOSTS.map((host, index) => (
          <AgentHostRow
            key={host}
            host={host}
            connection={readout.data?.connections.find((connection) => connection.host === host)}
            home={home}
            lines={lines}
            divided={index > 0}
          />
        ))}
      </Paper>
    </Stack>
  );
}
