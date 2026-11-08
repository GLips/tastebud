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
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { type AgentHostConnectLines, agentHostConnectLinesFor } from "@tastebud/core/agent-hosts";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import type { RecallPolicy } from "@tastebud/core/taste-vocabulary";
import { Check, ChevronRight, Copy } from "lucide-react";
import { useState } from "react";

import { reviewShellQuery, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { FactRow } from "#review/shared/ui/fact-row.tsx";
import { capitalize, KindGlyph, RECALL_POLICY_LABELS } from "#review/shared/ui/kind-identity.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

const styles = stylex.create({
  screen: { maxWidth: "880px" },
  facts: {
    display: "grid",
    gridTemplateColumns: "120px minmax(0, 1fr)",
    columnGap: "16px",
    rowGap: "8px",
    alignItems: "baseline",
  },
  mono: { fontFamily: "var(--mantine-font-family-monospace)", wordBreak: "break-all" },
  prompt: { whiteSpace: "pre-wrap", lineHeight: 1.55, maxHeight: "360px", overflow: "auto" },
  snippet: { position: "relative" },
  copy: { position: "absolute", top: "6px", right: "6px" },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
});

function CopyableSnippet({ code, label }: { code: string; label: string }) {
  return (
    <Box {...stylex.props(styles.snippet)}>
      <Code block fz="xs" {...stylex.props(styles.mono)} aria-label={label}>
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

/** What a kind's recall policy means for an accepted item, in a sentence. */
function recallPolicyExplanation(kind: DerivedKindView, hookLimit: number): string {
  const explanations: Record<RecallPolicy, string> = {
    inject: `When a prompt's words match, the prompt hook adds up to ${hookLimit} accepted ${kind.plural} that apply where the agent works. Agents can also look them up.`,
    pull: `Never added to prompts. An agent gets accepted ${kind.plural} when it asks Tastebud about matching words.`,
    never: `Agents never see these. Accepted ${kind.plural} are your backlog, to read here.`,
  };
  return explanations[kind.recall];
}

function DerivedKindCard({ kind, hookLimit }: { kind: DerivedKindView; hookLimit: number }) {
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
          <FactRow label="Agents">
            <Stack gap="3xs" align="flex-start">
              <Badge color={RECALL_POLICY_BADGE_COLORS[kind.recall]} tt="none" fw={500}>
                {RECALL_POLICY_LABELS[kind.recall]}
              </Badge>
              <Text size="sm">{recallPolicyExplanation(kind, hookLimit)}</Text>
            </Stack>
          </FactRow>
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

function InstallSnippet({ title, code, label }: { title: string; code: string; label: string }) {
  return (
    <Stack gap="2xs">
      <Text size="sm">{title}</Text>
      <CopyableSnippet code={code} label={label} />
    </Stack>
  );
}

const AGENT_HOSTS = ["claude-code", "codex", "cursor", "vscode", "other"] as const;
type AgentHost = (typeof AGENT_HOSTS)[number];
const agentHostOf = (value: string): AgentHost => AGENT_HOSTS.find((host) => host === value) ?? "claude-code";

/** Hosts other than Claude Code run the npm package through npx; this line downloads it once, where errors show. */
function NpxPrefetchStep({ lines }: { lines: AgentHostConnectLines }) {
  return (
    <InstallSnippet
      title="First, once in a terminal, so the package downloads where a failure shows (needs Node):"
      code={lines.npxPrefetch}
      label="npx prefetch command"
    />
  );
}

function AgentHostSteps({ host, lines }: { host: AgentHost; lines: AgentHostConnectLines }) {
  switch (host) {
    case "claude-code":
      return (
        <>
          <Text size="sm" c="dimmed">
            The plugin brings the prompt hook, saving words over MCP, and /tastebud:review.
          </Text>
          <InstallSnippet
            title="Install the plugin:"
            code={lines.claudeCodePlugin}
            label="Claude Code plugin install"
          />
          {lines.claudeCodeStoreSettings !== undefined && (
            <InstallSnippet
              title="Then point it at this store, in ~/.claude/settings.json:"
              code={prettyJson(lines.claudeCodeStoreSettings)}
              label="Claude Code store setting"
            />
          )}
        </>
      );
    case "codex":
      return (
        <>
          <Text size="sm" c="dimmed">
            Codex can save words and recall them; it has no prompt hook.
          </Text>
          <NpxPrefetchStep lines={lines} />
          <InstallSnippet title="Then register the server:" code={lines.codex} label="Codex command" />
        </>
      );
    case "cursor":
      return (
        <>
          <Text size="sm" c="dimmed">
            Cursor can save words and recall them; it has no prompt hook.
          </Text>
          <NpxPrefetchStep lines={lines} />
          <Stack gap="2xs">
            <Group gap="xs">
              <Text size="sm">Then add this to ~/.cursor/mcp.json, or</Text>
              <Anchor href={lines.cursorInstallLink} target="_blank" rel="noreferrer" size="sm">
                Add to Cursor
              </Anchor>
            </Group>
            <CopyableSnippet code={prettyJson(lines.mcpServersJson)} label="Cursor MCP config" />
          </Stack>
        </>
      );
    case "vscode":
      return (
        <>
          <Text size="sm" c="dimmed">
            VS Code can save words and recall them; it has no prompt hook.
          </Text>
          <NpxPrefetchStep lines={lines} />
          <InstallSnippet title="Then register the server:" code={lines.vscode} label="VS Code command" />
        </>
      );
    case "other":
      return (
        <>
          <Text size="sm" c="dimmed">
            Any MCP client (Claude Desktop, Windsurf, …) can save words and recall them; none has a prompt hook.
          </Text>
          <NpxPrefetchStep lines={lines} />
          <InstallSnippet
            title="Then add this to the client's MCP config:"
            code={prettyJson(lines.mcpServersJson)}
            label="MCP config"
          />
        </>
      );
  }
}

/** `storeRoot` is undefined for the default store, whose lines carry no store at all. */
function AgentHostInstallLines({ storeRoot }: { storeRoot: string | undefined }) {
  const lines = agentHostConnectLinesFor(storeRoot);
  const [host, setHost] = useState<AgentHost>("claude-code");
  return (
    <Stack gap="sm">
      <Stack gap="3xs">
        <Text fw={600}>Connect an agent</Text>
        <Text size="xs" c="dimmed">
          Pick the agent you use; each line is already set for this store.
        </Text>
      </Stack>
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
      <Stack gap="sm">
        <AgentHostSteps host={host} lines={lines} />
      </Stack>
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
  return (
    <Stack gap="lg" {...stylex.props(styles.screen)}>
      <Stack gap="3xs">
        <Title order={3}>Settings</Title>
        <Text size="sm" c="dimmed">
          How this store is set up. Ask your agent to change it.
        </Text>
        <Text size="xs" c="dimmed">
          This page only reads. Your agent edits <Code>tastebud.config.ts</Code> in the store (guided by{" "}
          <Code>tastebud config-show --guide</Code>), and this page picks the change up on save.
        </Text>
      </Stack>

      <Paper p="md">
        <Box {...stylex.props(styles.facts)}>
          <FactRow label="Owner">
            <Text size="sm">{catalog.owner}</Text>
          </FactRow>
          <FactRow label="Store">
            <Text fz="xs" {...stylex.props(styles.mono)}>
              {storeRoot}
            </Text>
          </FactRow>
          <FactRow label="Config">
            <Text fz="xs" {...stylex.props(styles.mono)}>
              {storeRoot.replace(/\/+$/, "")}/tastebud.config.ts
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
          <FactRow label="Prompt hook">
            <Text size="sm">
              At most {catalog.hook.limit} items, within {catalog.hook.budgetMs} ms
            </Text>
          </FactRow>
        </Box>
      </Paper>

      <Stack gap="sm">
        <Stack gap="3xs">
          <Text fw={600}>Derived kinds</Text>
          <Text size="xs" c="dimmed">
            What agents propose for you to accept. Ask an agent to add a kind or change one.
          </Text>
        </Stack>
        {catalog.derivedKinds.map((kind) => (
          <DerivedKindCard key={kind.key} kind={kind} hookLimit={catalog.hook.limit} />
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

      <AgentHostInstallLines storeRoot={storeIsDefault ? undefined : storeRoot} />
    </Stack>
  );
}
