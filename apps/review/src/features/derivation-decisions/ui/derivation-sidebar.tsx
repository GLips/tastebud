/**
 * The derivation page's sidebar, on every status: its properties, its decision history newest first
 * in plain words, its revision chain, and what points back at it.
 */
import { Box, Group, Paper, Stack, Text, Timeline } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { isSameScope } from "@tastebud/core/places";
import type { DerivationSummary, DerivationView, ShowResult } from "@tastebud/core/record-views";
import { type DecisionRecord, scopeFromFields } from "@tastebud/core/records";
import type { RecallPolicy } from "@tastebud/core/taste-vocabulary";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { describeAuthor, formatReviewDate, formatReviewTime } from "#review/shared/format.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { DerivationSummaryLine } from "#review/shared/ui/derivation-link.tsx";
import { FactRow } from "#review/shared/ui/fact-row.tsx";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { DerivationStatusDot } from "#review/shared/ui/status-chips.tsx";

const styles = stylex.create({
  current: { fontWeight: 600 },
  facts: {
    display: "grid",
    gridTemplateColumns: "104px minmax(0, 1fr)",
    columnGap: "10px",
    rowGap: "8px",
    alignItems: "baseline",
  },
});

const DECISION_BULLET_COLORS: Record<DecisionRecord["outcome"], string> = {
  accept: "tastebud",
  reject: "red",
  retract: "gray",
};

const STATUS_WORDS: Record<DerivationView["status"], string> = {
  pending: "Waiting for you",
  accepted: "Accepted",
  rejected: "Rejected",
  retracted: "Retracted",
  superseded: "Replaced by a revision",
};

/** Where its scope stands, read with its status: only an accepted one applies anywhere right now. */
const SCOPE_LABELS: Record<DerivationView["status"], string> = {
  pending: "Proposed for",
  accepted: "Applies in",
  rejected: "Was proposed for",
  retracted: "Applied in",
  superseded: "Applied in",
};

const RECALL_WORDS: Record<RecallPolicy, string> = {
  inject: "agents are told it automatically",
  pull: "agents find it when they look",
  never: "never told to agents",
};

const revisionChainOf = (view: DerivationView): Array<DerivationSummary> => [
  ...view.ancestors,
  view,
  ...view.revisions,
];

function DerivationProperties({
  view,
  kind,
  owner,
  known,
}: {
  view: DerivationView;
  kind: DerivedKindView | undefined;
  owner: string;
  known: KnownPlaces;
}) {
  const amended = !isSameScope(view.proposedScope, view.effectiveScope);
  return (
    <Paper p="md">
      <Box {...stylex.props(styles.facts)}>
        <FactRow label="Status">
          <Group gap="xs" wrap="nowrap">
            <DerivationStatusDot status={view.status} />
            <Text size="sm">{STATUS_WORDS[view.status]}</Text>
          </Group>
        </FactRow>
        <FactRow label={SCOPE_LABELS[view.status]}>
          <Stack gap="3xs">
            <ScopeChips scope={view.effectiveScope} labels={known.labels} wrap="wrap" />
            {view.status === "pending" && view.scopeSource === "defaulted" && (
              <Text size="xs" c="dimmed">
                Guessed from where the agent was working
              </Text>
            )}
          </Stack>
        </FactRow>
        {amended && (
          <FactRow label="Proposed for">
            <Stack gap="3xs">
              <ScopeChips scope={view.proposedScope} labels={known.labels} wrap="wrap" />
              <Text size="xs" c="dimmed">
                You changed where it applies
              </Text>
            </Stack>
          </FactRow>
        )}
        <FactRow label="Kind">
          <Text size="sm">
            {capitalize(view.kindLabel)}
            {kind !== undefined && (
              <Text span size="xs" c="dimmed">
                {" "}
                · {RECALL_WORDS[kind.recall]}
              </Text>
            )}
          </Text>
        </FactRow>
        <FactRow label="Proposed by">
          <Text size="sm">{describeAuthor(view.derivation.proposed_by, owner)}</Text>
        </FactRow>
        <FactRow label="Proposed">
          <Text size="sm" title={formatReviewTime(view.proposedAt)}>
            {formatReviewDate(view.proposedAt)}
          </Text>
        </FactRow>
      </Box>
    </Paper>
  );
}

/** One decision in plain words, read against the decision before it. */
const decisionHeadline = (entry: DecisionRecord, previous: DecisionRecord | undefined): string => {
  if (entry.outcome === "reject") return "Rejected";
  if (entry.outcome === "retract") return "Retracted";
  switch (previous?.outcome) {
    case "accept":
      return "Moved to a new scope";
    case "reject":
      return "Accepted after all";
    case "retract":
      return "Accepted again";
    default:
      return "Accepted";
  }
};

function DecisionEntryBody({ entry, owner, known }: { entry: DecisionRecord; owner: string; known: KnownPlaces }) {
  return (
    <Stack gap="3xs">
      <Text size="xs" c="dimmed" title={formatReviewTime(entry.at)}>
        {describeAuthor(entry.by, owner)} · {formatReviewDate(entry.at)}
      </Text>
      {entry.scope !== undefined && (
        <Group gap="2xs">
          <Text size="xs" c="dimmed">
            Applies in
          </Text>
          <ScopeChips
            scope={scopeFromFields({ scope: entry.scope, ...(entry.places && { places: entry.places }) })}
            labels={known.labels}
            wrap="wrap"
          />
        </Group>
      )}
      {entry.acknowledges !== undefined && (
        <Text size="xs" c="dimmed">
          You weighed {entry.acknowledges.length} similar {entry.acknowledges.length === 1 ? "one" : "ones"} it overlaps
        </Text>
      )}
      {entry.reason !== undefined && <Text size="sm">“{entry.reason}”</Text>}
    </Stack>
  );
}

function DecisionHistory({ view, owner, known }: { view: DerivationView; owner: string; known: KnownPlaces }) {
  const newestFirst = view.decisions
    .map((entry, index) => ({ entry, previous: view.decisions[index - 1] }))
    .toReversed();
  return (
    <Paper p="md">
      <Text size="sm" fw={600} mb="sm">
        History
      </Text>
      {/* Timeline marks items active by cloning its direct children, so Timeline.Item stays at the call site. */}
      <Timeline bulletSize={10} lineWidth={2} active={0}>
        {newestFirst.map(({ entry, previous }) => (
          <Timeline.Item
            key={entry.id}
            color={DECISION_BULLET_COLORS[entry.outcome]}
            title={
              <Text size="sm" fw={600}>
                {decisionHeadline(entry, previous)}
              </Text>
            }
          >
            <DecisionEntryBody entry={entry} owner={owner} known={known} />
          </Timeline.Item>
        ))}
        <Timeline.Item
          color="gray"
          title={
            <Text size="sm" fw={600}>
              Proposed
            </Text>
          }
        >
          <Text size="xs" c="dimmed" title={formatReviewTime(view.proposedAt)}>
            {describeAuthor(view.derivation.proposed_by, owner)} · {formatReviewDate(view.proposedAt)}
          </Text>
        </Timeline.Item>
      </Timeline>
    </Paper>
  );
}

function ChainLink({ summary, current }: { summary: DerivationSummary; current: boolean }) {
  const catalog = useReviewCatalog();
  return current ? (
    <Text size="sm" {...stylex.props(styles.current)}>
      This revision · {summary.status}
    </Text>
  ) : (
    <DerivationSummaryLine catalog={catalog} summary={summary} />
  );
}

function SidebarList({
  title,
  explanation,
  items,
}: {
  title: string;
  explanation: string;
  items: ReadonlyArray<DerivationSummary>;
}) {
  const catalog = useReviewCatalog();
  if (items.length === 0) return null;
  return (
    <Paper p="md">
      <Text size="sm" fw={600}>
        {title}
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        {explanation}
      </Text>
      <Stack gap="xxs">
        {items.map((item) => (
          <DerivationSummaryLine catalog={catalog} key={item.id} summary={item} />
        ))}
      </Stack>
    </Paper>
  );
}

export function DerivationSidebar({
  view,
  kind,
  detail,
  owner,
  known,
}: {
  view: DerivationView;
  kind: DerivedKindView | undefined;
  detail: ShowResult;
  owner: string;
  known: KnownPlaces;
}) {
  const chain = revisionChainOf(view);
  return (
    <Stack gap="md">
      <DerivationProperties view={view} kind={kind} owner={owner} known={known} />
      <DecisionHistory view={view} owner={owner} known={known} />
      {chain.length > 1 && (
        <Paper p="md">
          <Text size="sm" fw={600} mb="sm">
            Revisions
          </Text>
          <Timeline bulletSize={10} lineWidth={2} active={view.ancestors.length}>
            {chain.map((summary) => (
              <Timeline.Item key={summary.id}>
                <ChainLink summary={summary} current={summary.id === view.id} />
              </Timeline.Item>
            ))}
          </Timeline>
        </Paper>
      )}
      <SidebarList
        title="Built on this"
        explanation="Later proposals that cite it as evidence."
        items={detail.citedBy}
      />
      <SidebarList
        title="Proposed again despite this"
        explanation="Later proposals that came close to it and said what changed since."
        items={detail.despitedBy}
      />
      <SidebarList
        title="Accepted despite this"
        explanation="You accepted these knowing they overlap it."
        items={detail.acknowledgedBy}
      />
    </Stack>
  );
}
