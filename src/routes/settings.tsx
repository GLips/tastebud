import {
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
import { createFileRoute } from "@tanstack/react-router";
import { Check, ChevronRight, Copy } from "lucide-react";
import { useState } from "react";

import type { DerivedKindView } from "../shared/catalog-view.ts";
import type { PlaceResolverName } from "../shared/vocabulary.ts";
import { FactRow } from "../ui/fact-row.tsx";
import { capitalize, describeKindDelivery, KindGlyph, RECALL_POLICY_LABELS } from "../ui/kind-identity.tsx";
import { reviewShellQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { useReviewCatalog } from "../ui/use-review-context.ts";

export const Route = createFileRoute("/settings")({ component: SettingsScreen });

const styles = stylex.create({
  screen: { maxWidth: "880px" },
  facts: {
    display: "grid",
    gridTemplateColumns: "120px minmax(0, 1fr)",
    columnGap: "16px",
    rowGap: "8px",
    alignItems: "baseline",
  },
  mono: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: "12px", wordBreak: "break-all" },
  prompt: { whiteSpace: "pre-wrap", fontSize: "12px", lineHeight: 1.55, maxHeight: "360px", overflow: "auto" },
  snippet: { position: "relative" },
  copy: { position: "absolute", top: "6px", right: "6px" },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
});

const RESOLVER_WORDING: Record<PlaceResolverName, string> = {
  git: "git: a repo place from the origin remote and subdirectory, else the directory",
  directories: "directories: always the working directory",
  custom: "custom: a function in taste.config.ts",
};

function CopyableSnippet({ code, label }: { code: string; label: string }) {
  return (
    <div {...stylex.props(styles.snippet)}>
      <Code block {...stylex.props(styles.mono)} aria-label={label}>
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
    </div>
  );
}

function DerivedKindCard({ kind }: { kind: DerivedKindView }) {
  const catalog = useReviewCatalog();
  const [open, setOpen] = useState(false);
  const sources = (catalog?.sourceKinds ?? []).filter((source) => kind.sources.includes(source.key));
  return (
    <Paper p="md">
      <Stack gap={10}>
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Group gap={8}>
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
          <Badge color={kind.recall === "inject" ? "taste" : kind.recall === "pull" ? "cyan" : "gray"} variant="light">
            {kind.recall}
          </Badge>
        </Group>
        <div {...stylex.props(styles.facts)}>
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
        </div>
        <UnstyledButton onClick={() => setOpen(!open)} aria-expanded={open}>
          <Group gap={4}>
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
          <Code block {...stylex.props(styles.prompt)}>
            {kind.proposalPrompt}
          </Code>
        </Collapse>
      </Stack>
    </Paper>
  );
}

const HOOK_SNIPPET = JSON.stringify(
  { hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: "taste hook prompt" }] }] } },
  null,
  2,
);

const mcpSnippetFor = (storeRoot: string) =>
  JSON.stringify(
    { mcpServers: { taste: { command: "taste", args: ["mcp"], env: { TASTE_STORE: storeRoot } } } },
    null,
    2,
  );

function SettingsScreen() {
  const shell = useQuery(reviewShellQuery);
  if (shell.error) return <QueryErrorAlert error={shell.error} />;
  if (shell.data === undefined)
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  const { catalog, storeRoot } = shell.data;
  return (
    <Stack gap="lg" {...stylex.props(styles.screen)}>
      <Stack gap={2}>
        <Title order={3}>Settings</Title>
        <Text size="xs" c="dimmed">
          Read-only. The config is code: edit <code>taste.config.ts</code> in the store, and this page picks it up on
          save.
        </Text>
      </Stack>

      <Paper p="md">
        <div {...stylex.props(styles.facts)}>
          <FactRow label="Owner">
            <Text size="sm">{catalog.owner}</Text>
          </FactRow>
          <FactRow label="Store">
            <Text {...stylex.props(styles.mono)}>{storeRoot}</Text>
          </FactRow>
          <FactRow label="Config">
            <Text {...stylex.props(styles.mono)}>{storeRoot.replace(/\/+$/, "")}/taste.config.ts</Text>
          </FactRow>
          <FactRow label="Place resolver">
            <Text size="sm">{RESOLVER_WORDING[catalog.resolver]}</Text>
          </FactRow>
          <FactRow label="Prompt hook">
            <Text size="sm">
              At most {catalog.hook.limit} items, within {catalog.hook.budgetMs} ms
            </Text>
          </FactRow>
        </div>
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
          <div {...stylex.props(styles.facts)}>
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
          </div>
        </Paper>
      </Stack>

      <Stack gap="sm">
        <Text fw={600}>Install</Text>
        <Stack gap={4}>
          <Text size="sm">Prompt hook, in Claude Code's settings.json</Text>
          <CopyableSnippet code={HOOK_SNIPPET} label="hook settings" />
        </Stack>
        <Stack gap={4}>
          <Text size="sm">MCP server, in your MCP client's config</Text>
          <CopyableSnippet code={mcpSnippetFor(storeRoot)} label="MCP config" />
          <Text size="xs" c="dimmed">
            Or with Claude Code: <code>claude mcp add taste --env TASTE_STORE={storeRoot} -- taste mcp</code>
          </Text>
        </Stack>
      </Stack>
    </Stack>
  );
}
