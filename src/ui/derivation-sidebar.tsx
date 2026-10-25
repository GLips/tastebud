/** The derivation page's sidebar: its decisions, its revision chain, and what points back at it. */
import { Group, Paper, Stack, Text, Timeline } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";

import type { DecisionRecord, DerivationSummary, DerivationView, ShowResult } from "../core/index.ts";
import { DerivationSummaryLine } from "./derivation-link.tsx";
import { describeAuthor, formatReviewTime } from "./format.ts";
import { ScopeChips } from "./place-chips.tsx";
import type { KnownPlaces } from "./use-review-context.ts";

const styles = stylex.create({
  current: { fontWeight: 600 },
});

const DECISION_BULLET_COLORS: Record<DecisionRecord["outcome"], string> = {
  accept: "taste",
  reject: "red",
  retract: "gray",
};

const revisionChainOf = (view: DerivationView): Array<DerivationSummary> => [
  ...view.ancestors,
  view,
  ...view.revisions,
];

/** Whether the sidebar has anything to show, so the page can drop its column when it doesn't. */
export const hasDerivationSidebar = (view: DerivationView, detail: ShowResult): boolean =>
  view.decisions.length > 0 ||
  revisionChainOf(view).length > 1 ||
  detail.citedBy.length + detail.despitedBy.length + detail.acknowledgedBy.length > 0;

function ChainLink({ summary, current }: { summary: DerivationSummary; current: boolean }) {
  return current ? (
    <Text size="sm" {...stylex.props(styles.current)}>
      This revision · {summary.status}
    </Text>
  ) : (
    <DerivationSummaryLine summary={summary} />
  );
}

// Timeline marks items active by cloning its direct children, so the Timeline.Item stays at the call site.
function DecisionEntryBody({ entry, owner, known }: { entry: DecisionRecord; owner: string; known: KnownPlaces }) {
  return (
    <>
      <Text size="xs" c="dimmed">
        {describeAuthor(entry.by, owner)}
        {entry.via !== undefined && ` via ${entry.via}`} · {formatReviewTime(entry.at)}
      </Text>
      {entry.scope !== undefined && (
        <Group gap={4} mt={4}>
          <Text size="xs" c="dimmed">
            with scope
          </Text>
          <ScopeChips
            scope={entry.scope === "global" ? { scope: "global" } : { scope: "places", places: entry.places ?? [] }}
            labels={known.labels}
            wrap="wrap"
          />
        </Group>
      )}
      {entry.acknowledges !== undefined && (
        <Text size="xs" c="dimmed" mt={2}>
          Acknowledged {entry.acknowledges.length} near {entry.acknowledges.length === 1 ? "repeat" : "repeats"}
        </Text>
      )}
      {entry.reason !== undefined && <Text size="sm">“{entry.reason}”</Text>}
    </>
  );
}

function SidebarList({ title, items }: { title: string; items: ReadonlyArray<DerivationSummary> }) {
  if (items.length === 0) return null;
  return (
    <Paper p="md">
      <Text size="sm" fw={600} mb="sm">
        {title}
      </Text>
      <Stack gap={6}>
        {items.map((item) => (
          <DerivationSummaryLine key={item.id} summary={item} />
        ))}
      </Stack>
    </Paper>
  );
}

export function DerivationSidebar({
  view,
  detail,
  owner,
  known,
}: {
  view: DerivationView;
  detail: ShowResult;
  owner: string;
  known: KnownPlaces;
}) {
  const chain = revisionChainOf(view);
  return (
    <Stack gap="md">
      {view.decisions.length > 0 && (
        <Paper p="md">
          <Text size="sm" fw={600} mb="sm">
            Decisions
          </Text>
          <Timeline bulletSize={10} lineWidth={2} active={view.decisions.length - 1}>
            {view.decisions.map((entry) => (
              <Timeline.Item
                key={entry.id}
                color={DECISION_BULLET_COLORS[entry.outcome]}
                title={
                  <Text size="sm" fw={600} tt="capitalize">
                    {entry.outcome}
                  </Text>
                }
              >
                <DecisionEntryBody entry={entry} owner={owner} known={known} />
              </Timeline.Item>
            ))}
          </Timeline>
        </Paper>
      )}
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
      <SidebarList title="Cited by" items={detail.citedBy} />
      <SidebarList title="Proposed again despite this" items={detail.despitedBy} />
      <SidebarList title="Accepted despite this" items={detail.acknowledgedBy} />
    </Stack>
  );
}
