import {
  ActionIcon,
  Badge,
  Box,
  Center,
  Code,
  Collapse,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import type { CatalogView, DerivedKindView } from "@tastebud/core/kind-catalog";
import type { RecallPolicy } from "@tastebud/core/taste-vocabulary";
import { ChevronRight, Ellipsis, MessageSquare } from "lucide-react";
import { type ReactNode, useState } from "react";

import { reviewShellQuery, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { FactRow } from "#review/shared/ui/fact-row.tsx";
import { capitalize, describeKindDelivery, KindGlyph, RECALL_POLICY_LABELS } from "#review/shared/ui/kind-identity.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import { AgentHostConnections } from "./agent-host-connections.tsx";
import { CopyableSnippet } from "./copyable-snippet.tsx";

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
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
  badge: { flexShrink: 0 },
});

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
            <SupportingText tier="faint" {...stylex.props(styles.mono)}>
              {kind.key}
            </SupportingText>
          </Group>
          {kind.description !== undefined && <SupportingText tier="secondary">{kind.description}</SupportingText>}
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
            <SupportingText tier="secondary">Proposal prompt agents read</SupportingText>
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

/** How it behaves' ⋯ menu: the only way to change behaviour is to ask an agent, so its prompt lives here. */
function HowItBehavesMenu({ configPath }: { configPath: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Menu position="bottom-end" withArrow>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" size="input-sm" aria-label="More for How it behaves">
            <Ellipsis size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<MessageSquare size={14} />} onClick={() => setAsking(true)}>
            Ask your agent to change this…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Modal opened={asking} onClose={() => setAsking(false)} title="Ask your agent to change this" size="xl">
        <Stack gap="xs">
          <SupportingText tier="secondary">Paste this to your agent, with what you want changed.</SupportingText>
          <CopyableSnippet code={askAgentPromptOf(configPath)} label="prompt to change the setup" />
        </Stack>
      </Modal>
    </>
  );
}

function HowItBehaves({ catalog, configPath }: { catalog: CatalogView; configPath: string }) {
  return (
    <Stack gap="sm" component="section" aria-label="How it behaves">
      <Group justify="space-between" align="center">
        <Text fw={600}>How it behaves</Text>
        <HowItBehavesMenu configPath={configPath} />
      </Group>
      <Paper p="md">
        <Box {...stylex.props(styles.facts)}>
          <FactRow label="Decides">
            <Text size="sm">{catalog.ownerName}</Text>
          </FactRow>
          <FactRow label="Agents">
            <Tooltip label={`Only ${catalog.ownerName} ${ownerDecisionsOf(catalog)}`} withArrow openDelay={150}>
              <Text size="sm" w="fit-content">
                Propose only
              </Text>
            </Tooltip>
          </FactRow>
          <FactRow label="Each prompt">
            <Text size="sm">
              Up to {catalog.hook.limit} items · within {catalog.hook.budgetMs} ms · only where the agent works
            </Text>
          </FactRow>
          {catalog.derivedKinds.map((kind) => (
            <FactRow key={kind.key} label={capitalize(kind.plural)}>
              <Tooltip label={describeKindDelivery(kind)} withArrow openDelay={150}>
                <Badge
                  color={RECALL_POLICY_BADGE_COLORS[kind.recall]}
                  tt="none"
                  fw={500}
                  {...stylex.props(styles.badge)}
                >
                  {RECALL_POLICY_LABELS[kind.recall]}
                </Badge>
              </Tooltip>
            </FactRow>
          ))}
        </Box>
      </Paper>
    </Stack>
  );
}

/** A rarely needed section, collapsed to its title and a quiet summary until opened. */
function DisclosureSection({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="sm" component="section" aria-label={title}>
      <UnstyledButton onClick={() => setOpen(!open)} aria-expanded={open} w="fit-content">
        <Group gap="2xs">
          <ChevronRight
            size={14}
            color="var(--mantine-color-gray-6)"
            {...stylex.props(styles.chevron, open && styles.chevronOpen)}
          />
          <Text fw={600}>{title}</Text>
          <SupportingText tier="faint">{summary}</SupportingText>
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>{children}</Collapse>
    </Stack>
  );
}

function StoreFacts({
  catalog,
  storeRoot,
  configPath,
}: {
  catalog: CatalogView;
  storeRoot: string;
  configPath: string;
}) {
  return (
    <DisclosureSection title="Store" summary={storeRoot}>
      <Paper p="md">
        <Box {...stylex.props(styles.facts)}>
          <FactRow label="Folder">
            <Text fz="xs" {...stylex.props(styles.mono)}>
              {storeRoot}
            </Text>
          </FactRow>
          <FactRow label="Config">
            <Text fz="xs" {...stylex.props(styles.mono)}>
              {configPath}
            </Text>
          </FactRow>
          <FactRow label="Place resolver">
            <Group gap="xs">
              <Text size="sm">{capitalize(catalog.resolver)}</Text>
              <AnchorLink to="/places" size="sm">
                Places →
              </AnchorLink>
            </Group>
          </FactRow>
        </Box>
      </Paper>
    </DisclosureSection>
  );
}

/** The kinds as configured: labels, button wording, sources and the prompts agents read. Rarely needed. */
function KindDetails({ catalog }: { catalog: CatalogView }) {
  return (
    <DisclosureSection
      title="Kinds"
      summary={`${catalog.derivedKinds.length} derived · ${catalog.sourceKinds.length} source`}
    >
      <Stack gap="lg">
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            Derived
          </Text>
          {catalog.derivedKinds.map((kind) => (
            <DerivedKindCard key={kind.key} kind={kind} />
          ))}
        </Stack>
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            Source
          </Text>
          <Paper p="md">
            <Box {...stylex.props(styles.facts)}>
              {catalog.sourceKinds.map((kind) => (
                <FactRow key={kind.key} label={kind.key}>
                  <Text size="sm">
                    {capitalize(kind.plural)}
                    {kind.description !== undefined && (
                      <SupportingText span tier="secondary">
                        {" "}
                        — {kind.description}
                      </SupportingText>
                    )}
                  </Text>
                </FactRow>
              ))}
            </Box>
          </Paper>
        </Stack>
      </Stack>
    </DisclosureSection>
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
      <ReviewPageHeader title="Settings" />
      <AgentHostConnections storeRoot={storeIsDefault ? undefined : storeRoot} />
      <HowItBehaves catalog={catalog} configPath={configPath} />
      <StoreFacts catalog={catalog} storeRoot={storeRoot} configPath={configPath} />
      <KindDetails catalog={catalog} />
    </Stack>
  );
}
