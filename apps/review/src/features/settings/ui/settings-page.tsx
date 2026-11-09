import {
  Anchor,
  Box,
  ActionIcon,
  Badge,
  Center,
  Code,
  Collapse,
  CopyButton,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { type AgentHostConnectLines, agentHostConnectLinesFor } from "@tastebud/core/agent-hosts";
import type { CatalogView, DerivedKindView } from "@tastebud/core/kind-catalog";
import type { RecallPolicy } from "@tastebud/core/taste-vocabulary";
import { Check, ChevronRight, Copy } from "lucide-react";
import { type ReactNode, useState } from "react";

import { reviewShellQuery, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { FactRow } from "#review/shared/ui/fact-row.tsx";
import { capitalize, describeKindDelivery, KindGlyph, RECALL_POLICY_LABELS } from "#review/shared/ui/kind-identity.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

const styles = stylex.create({
  facts: {
    display: "grid",
    gridTemplateColumns: "120px minmax(0, 1fr)",
    columnGap: "16px",
    rowGap: "8px",
    alignItems: "baseline",
  },
  mono: { fontFamily: "var(--mantine-font-family-monospace)", wordBreak: "break-all" },
  prompt: { whiteSpace: "pre-wrap", lineHeight: 1.55, maxHeight: "360px", overflow: "auto" },
  // Every command gets the same frame, as wide as its text (up to the column), with copy inside it.
  snippet: { position: "relative", width: "fit-content", maxWidth: "100%" },
  // Wraps long paths so nothing hides behind horizontal scroll; the copied text keeps its own lines.
  snippetCode: {
    whiteSpace: "pre-wrap",
    wordBreak: "normal",
    overflowWrap: "anywhere",
    paddingRight: "40px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--mantine-color-gray-3)",
    borderRadius: "var(--mantine-radius-sm)",
  },
  copy: { position: "absolute", top: "6px", right: "6px" },
  stepNumber: { flexShrink: 0 },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
  badge: { flexShrink: 0 },
});

function CopyableSnippet({ code, label }: { code: string; label: string }) {
  return (
    <Box {...stylex.props(styles.snippet)}>
      <Code block fz="xs" {...stylex.props(styles.mono, styles.snippetCode)} aria-label={label}>
        {code}
      </Code>
      <CopyButton value={code}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
            <ActionIcon
              size="sm"
              variant="default"
              aria-label={`Copy ${label}`}
              onClick={copy}
              {...stylex.props(styles.copy)}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Box>
  );
}

const RECALL_POLICY_BADGE_COLORS: Record<RecallPolicy, string> = { inject: "tastebud", pull: "cyan", never: "gray" };

function DerivedKindCard({ kind }: { kind: DerivedKindView }) {
  const catalog = useReviewCatalog();
  const [open, setOpen] = useState(false);
  const sources = (catalog?.sourceKinds ?? []).filter((source) => kind.sources.includes(source.key));
  return (
    <Paper p="md">
      <Stack gap={10}>
        <Stack gap="3xs">
          <Group gap="xs">
            <KindGlyph catalog={catalog} kind={kind.key} size={13} />
            <Text fw={600}>{capitalize(kind.plural)}</Text>
            <Text size="xs" c="dimmed" {...stylex.props(styles.mono)}>
              {kind.key}
            </Text>
          </Group>
          {kind.description !== undefined && (
            <Text size="sm" c="dimmed">
              {kind.description}
            </Text>
          )}
        </Stack>
        <Box {...stylex.props(styles.facts)}>
          <FactRow label="Labels">
            <Text size="sm">
              {kind.singular} / {kind.plural}
            </Text>
          </FactRow>
          <FactRow label="Accept button">
            <Text size="sm">{kind.acceptLabel}</Text>
          </FactRow>
          <FactRow label="Cites">
            <Text size="sm">
              {sources.length === 0 ? kind.sources.join(", ") : sources.map((source) => source.plural).join(" or ")}
            </Text>
          </FactRow>
        </Box>
        <UnstyledButton onClick={() => setOpen(!open)} aria-expanded={open}>
          <Group gap="2xs">
            <ChevronRight
              size={13}
              color="var(--mantine-color-gray-6)"
              {...stylex.props(styles.chevron, open && styles.chevronOpen)}
            />
            <Text size="xs" c="dimmed">
              Proposal prompt agents read
            </Text>
          </Group>
        </UnstyledButton>
        <Collapse expanded={open}>
          <Code block fz="xs" {...stylex.props(styles.prompt)}>
            {kind.proposalPrompt}
          </Code>
        </Collapse>
      </Stack>
    </Paper>
  );
}

/** The JSON lines from `agentHostConnectLinesFor`, laid out to read in a snippet. */
const prettyJson = (json: string) => JSON.stringify(JSON.parse(json), null, 2);

const AGENT_HOSTS = ["claude-code", "codex", "cursor", "vscode", "other"] as const;
type AgentHost = (typeof AGENT_HOSTS)[number];
const agentHostOf = (value: string): AgentHost => AGENT_HOSTS.find((host) => host === value) ?? "claude-code";

interface ConnectStep {
  readonly title: ReactNode;
  readonly code: string;
  readonly label: string;
}

/** What a host can do with Tastebud, and the steps that connect it, in order. */
function agentHostConnectPlan(host: AgentHost, lines: AgentHostConnectLines): { note: string; steps: ConnectStep[] } {
  // Hosts other than Claude Code run the npm package through npx; this downloads it once, where errors show.
  const prefetch: ConnectStep = {
    title: "Once, in a terminal, so the package downloads where a failure shows (needs Node):",
    code: lines.npxPrefetch,
    label: "npx prefetch command",
  };
  const noHook = "can save words and recall them; it has no prompt hook.";
  switch (host) {
    case "claude-code":
      return {
        note: "The plugin brings the prompt hook, saving words over MCP, and /tastebud:review.",
        steps: [
          { title: "Install the plugin:", code: lines.claudeCodePlugin, label: "Claude Code plugin install" },
          ...(lines.claudeCodeStoreSettings === undefined
            ? []
            : [
                {
                  title: "Point it at this store, in ~/.claude/settings.json:",
                  code: prettyJson(lines.claudeCodeStoreSettings),
                  label: "Claude Code store setting",
                },
              ]),
        ],
      };
    case "codex":
      return {
        note: `Codex ${noHook}`,
        steps: [prefetch, { title: "Register the server:", code: lines.codex, label: "Codex command" }],
      };
    case "cursor":
      return {
        note: `Cursor ${noHook}`,
        steps: [
          prefetch,
          {
            title: (
              <>
                Add this to ~/.cursor/mcp.json, or{" "}
                <Anchor href={lines.cursorInstallLink} target="_blank" rel="noreferrer" size="sm">
                  Add to Cursor
                </Anchor>
                :
              </>
            ),
            code: prettyJson(lines.mcpServersJson),
            label: "Cursor MCP config",
          },
        ],
      };
    case "vscode":
      return {
        note: `VS Code ${noHook}`,
        steps: [prefetch, { title: "Register the server:", code: lines.vscode, label: "VS Code command" }],
      };
    case "other":
      return {
        note: "Any MCP client (Claude Desktop, Windsurf, …) can save words and recall them; none has a prompt hook.",
        steps: [
          prefetch,
          {
            title: "Add this to the client's MCP config:",
            code: prettyJson(lines.mcpServersJson),
            label: "MCP config",
          },
        ],
      };
  }
}

/** `storeRoot` is undefined for the default store, whose lines carry no store at all. */
function AgentHostInstallLines({ storeRoot }: { storeRoot: string | undefined }) {
  const lines = agentHostConnectLinesFor(storeRoot);
  const [host, setHost] = useState<AgentHost>("claude-code");
  const plan = agentHostConnectPlan(host, lines);
  return (
    <Stack gap="sm">
      <Text fw={600}>Connect an agent</Text>
      <Paper p="md">
        <Stack gap="md">
          <Stack gap="2xs">
            <SegmentedControl
              w="fit-content"
              size="xs"
              value={host}
              onChange={(value) => setHost(agentHostOf(value))}
              data={[
                { value: "claude-code", label: "Claude Code" },
                { value: "codex", label: "Codex" },
                { value: "cursor", label: "Cursor" },
                { value: "vscode", label: "VS Code" },
                { value: "other", label: "Other MCP client" },
              ]}
            />
            <Text size="sm" c="dimmed">
              {plan.note} Each line is already set for this store.
            </Text>
          </Stack>
          {plan.steps.map((step, index) => (
            <Group key={step.label} gap="sm" wrap="nowrap" align="flex-start">
              <Badge variant="light" color="gray" circle {...stylex.props(styles.stepNumber)}>
                {index + 1}
              </Badge>
              <Stack gap="2xs" miw={0}>
                <Text size="sm">{step.title}</Text>
                <CopyableSnippet code={step.code} label={step.label} />
              </Stack>
            </Group>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}

/** A text the owner pastes to their agent; the agent fills in the change from the guide. */
const askAgentPromptOf = (configPath: string) =>
  `Change my Tastebud setup: <say what you want, e.g. "send insights with prompts too">.\n` +
  `Run \`tastebud config-show --guide\` first, then edit ${configPath} and check it with \`tastebud config-show\`.`;

/**
 * An accept label as what the owner does: a one-word label is a verb ("Believe" reads "believes"); any
 * longer label ("Worth doing") isn't one, so it is quoted as the button the owner marks.
 */
const ownerActionOf = (label: string): string => {
  if (label.includes(" ")) return `marks “${label}”`;
  const verb = label.toLowerCase();
  return /(s|sh|ch|x|z)$/.test(verb) ? `${verb}es` : `${verb}s`;
};

/** Everything only the owner does, in the inbox buttons' own words: "believes, accepts, rejects or retracts". */
const ownerDecisionsOf = (catalog: CatalogView): string => {
  const actions = [
    ...new Set(catalog.derivedKinds.map((kind) => ownerActionOf(kind.acceptLabel))),
    "rejects",
    "retracts",
  ];
  return `${actions.slice(0, -1).join(", ")} or ${actions.at(-1)}`;
};

function HowItBehaves({ catalog, configPath }: { catalog: CatalogView; configPath: string }) {
  return (
    <Stack gap="sm">
      <Text fw={600}>How it behaves</Text>
      <Paper p="md">
        <Stack gap="md">
          <Box {...stylex.props(styles.facts)}>
            <FactRow label="Who decides">
              <Text size="sm">
                Agents only propose. Only {catalog.owner} {ownerDecisionsOf(catalog)}, here in the inbox.
              </Text>
            </FactRow>
            <FactRow label="Each prompt">
              <Text size="sm">
                Carries at most {catalog.hook.limit} items, only ones that apply where the agent works, and only if they
                are found within {catalog.hook.budgetMs} ms.
              </Text>
            </FactRow>
            {catalog.derivedKinds.map((kind) => (
              <FactRow key={kind.key} label={capitalize(kind.plural)}>
                <Group gap="xs" wrap="nowrap" align="baseline">
                  <Badge
                    color={RECALL_POLICY_BADGE_COLORS[kind.recall]}
                    tt="none"
                    fw={500}
                    {...stylex.props(styles.badge)}
                  >
                    {RECALL_POLICY_LABELS[kind.recall]}
                  </Badge>
                  <Text size="sm">{describeKindDelivery(kind)}</Text>
                </Group>
              </FactRow>
            ))}
          </Box>
          <Stack gap="2xs">
            <Text size="sm" fw={500}>
              Ask your agent to change this
            </Text>
            <CopyableSnippet code={askAgentPromptOf(configPath)} label="prompt to change the setup" />
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}

function ConfigurationDetails({
  catalog,
  storeRoot,
  configPath,
}: {
  catalog: CatalogView;
  storeRoot: string;
  configPath: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="sm">
      <UnstyledButton onClick={() => setOpen(!open)} aria-expanded={open} w="fit-content">
        <Group gap="2xs">
          <ChevronRight
            size={14}
            color="var(--mantine-color-gray-6)"
            {...stylex.props(styles.chevron, open && styles.chevronOpen)}
          />
          <Text fw={600}>Configuration details</Text>
          <Text size="xs" c="dimmed">
            Store, labels, button wording, sources and the prompts agents read
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>
        <Stack gap="lg">
          <Paper p="md">
            <Box {...stylex.props(styles.facts)}>
              <FactRow label="Store">
                <Text fz="xs" {...stylex.props(styles.mono)}>
                  {storeRoot}
                </Text>
              </FactRow>
              <FactRow label="Config">
                <Text fz="xs" {...stylex.props(styles.mono)}>
                  {configPath}
                </Text>
              </FactRow>
              <FactRow label="Resolver">
                <Text size="sm">
                  {catalog.resolver} ·{" "}
                  <AnchorLink to="/places" size="sm">
                    try it in Places →
                  </AnchorLink>
                </Text>
              </FactRow>
            </Box>
          </Paper>

          <Stack gap="sm">
            <Stack gap="3xs">
              <Text fw={600}>Derived kinds</Text>
              <Text size="xs" c="dimmed">
                What agents propose for you to accept.
              </Text>
            </Stack>
            {catalog.derivedKinds.map((kind) => (
              <DerivedKindCard key={kind.key} kind={kind} />
            ))}
          </Stack>

          <Stack gap="sm">
            <Stack gap="3xs">
              <Text fw={600}>Source kinds</Text>
              <Text size="xs" c="dimmed">
                Whose words the store keeps. Agents are told each description as when to save those words.
              </Text>
            </Stack>
            <Paper p="md">
              <Box {...stylex.props(styles.facts)}>
                {catalog.sourceKinds.map((kind) => (
                  <FactRow key={kind.key} label={kind.key}>
                    <Text size="sm">
                      {capitalize(kind.plural)}
                      {kind.description !== undefined && (
                        <Text span c="dimmed">
                          {" "}
                          — {kind.description}
                        </Text>
                      )}
                    </Text>
                  </FactRow>
                ))}
              </Box>
            </Paper>
          </Stack>
        </Stack>
      </Collapse>
    </Stack>
  );
}

export function SettingsPage() {
  const shell = useQuery(reviewShellQuery);
  if (shell.error) return <QueryErrorAlert error={shell.error} />;
  if (shell.data === undefined)
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  const { catalog, storeRoot, storeIsDefault } = shell.data;
  const configPath = `${storeRoot.replace(/\/+$/, "")}/tastebud.config.ts`;
  return (
    <Stack gap="xl">
      <ReviewPageHeader
        title="Settings"
        purpose="Connect your agents, and see how this store treats what they propose."
        details="Read-only: your agent edits the config, and this page picks up the change on save."
      />
      <AgentHostInstallLines storeRoot={storeIsDefault ? undefined : storeRoot} />
      <HowItBehaves catalog={catalog} configPath={configPath} />
      <ConfigurationDetails catalog={catalog} storeRoot={storeRoot} configPath={configPath} />
    </Stack>
  );
}
