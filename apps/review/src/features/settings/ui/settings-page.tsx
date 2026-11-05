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
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { agentHostConnectLinesFor } from "@tastebud/core/agent-hosts";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import type { RecallPolicy } from "@tastebud/core/taste-vocabulary";
import { Check, ChevronRight, Copy } from "lucide-react";
import { useState } from "react";

import { reviewShellQuery, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { FactRow } from "#review/shared/ui/fact-row.tsx";
import { capitalize, describeKindDelivery, KindGlyph, RECALL_POLICY_LABELS } from "#review/shared/ui/kind-identity.tsx";
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

function DerivedKindCard({ kind }: { kind: DerivedKindView }) {
  const catalog = useReviewCatalog();
  const [open, setOpen] = useState(false);
  const sources = (catalog?.sourceKinds ?? []).filter((source) => kind.sources.includes(source.key));
  return (
    <Paper p="md">
      <Stack gap={10}>
        <Group justify="space-between" align="flex-start">
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
          <Badge color={RECALL_POLICY_BADGE_COLORS[kind.recall]} variant="light">
            {kind.recall}
          </Badge>
        </Group>
        <Box {...stylex.props(styles.facts)}>
          <FactRow label="Labels">
            <Text size="sm">
              {kind.singular} / {kind.plural}
            </Text>
          </FactRow>
          <FactRow label="Delivery">
            <Text size="sm">
              {RECALL_POLICY_LABELS[kind.recall]}. {describeKindDelivery(kind)}
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

/** `storeRoot` is undefined for the default store, whose lines carry no store at all. */
function AgentHostInstallLines({ storeRoot }: { storeRoot: string | undefined }) {
  const lines = agentHostConnectLinesFor(storeRoot);
  return (
    <Stack gap="sm">
      <Text fw={600}>Connect an agent</Text>
      <InstallSnippet
        title="Claude Code: the plugin (MCP server, skill, /tastebud:setup and the prompt hook)"
        code={lines.claudeCodePlugin}
        label="Claude Code plugin install"
      />
      {lines.claudeCodeStoreSettings !== undefined && (
        <InstallSnippet
          title="…and, for this store, in ~/.claude/settings.json"
          code={prettyJson(lines.claudeCodeStoreSettings)}
          label="Claude Code store setting"
        />
      )}
      <InstallSnippet title="Codex" code={lines.codex} label="Codex command" />
      <Stack gap="2xs">
        <Group gap="xs">
          <Text size="sm">Cursor, in ~/.cursor/mcp.json, or</Text>
          <Anchor href={lines.cursorInstallLink} target="_blank" rel="noreferrer" size="sm">
            Add to Cursor
          </Anchor>
        </Group>
        <CopyableSnippet code={prettyJson(lines.mcpServersJson)} label="MCP config" />
        <Text size="xs" c="dimmed">
          Any other MCP client takes the same JSON. It runs the npm package through npx, so it needs Node.
        </Text>
      </Stack>
      <InstallSnippet title="VS Code" code={lines.vscode} label="VS Code command" />
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
        <Text size="xs" c="dimmed">
          Read-only. The config is code: ask an agent to run Tastebud's setup, or edit <code>tastebud.config.ts</code>{" "}
          in the store. This page picks it up on save.
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
        <Text fw={600}>Derived kinds</Text>
        {catalog.derivedKinds.map((kind) => (
          <DerivedKindCard key={kind.key} kind={kind} />
        ))}
      </Stack>

      <Stack gap="sm">
        <Text fw={600}>Source kinds</Text>
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
