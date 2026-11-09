/**
 * The derivation page's sidebar, on every status: the properties the status card doesn't state (kind,
 * who proposed it and when), a one-line-per-decision history, its revisions, and what points back. The
 * pending proposal the card notes is left out of "Proposed again despite this".
 */
import { Box, Group, Paper, Stack, Text, Timeline } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
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
  reopen: "blue",
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
}: {
  view: DerivationView;
  kind: DerivedKindView | undefined;
  owner: string;
}) {
  return (
    <Paper p="md">
      <Box {...stylex.props(styles.facts)}>
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
  if (entry.outcome === "reject") return previous?.outcome === "reject" ? "Reason changed" : "Rejected";
  if (entry.outcome === "retract") return "Retracted";
  if (entry.outcome === "reopen") return "Put back in the inbox";
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

/** Who and when, on the headline's line. The owner goes unnamed: nearly every decision is theirs. */
function EntryWhen({ by, at, owner }: { by: string; at: string; owner: string }) {
  return (
    <Text span size="xs" c="dimmed" fw={400} title={formatReviewTime(at)}>
      {" · "}
      {by === owner ? "" : `${describeAuthor(by, owner)}, `}
      {formatReviewDate(at)}
    </Text>
  );
}

/** A decision's quieter second line, when it has one: the scope an accept set and the near repeats it weighed. */
function DecisionEntryDetail({ entry, known }: { entry: DecisionRecord; known: KnownPlaces }) {
  if (entry.scope === undefined && entry.acknowledges === undefined) return null;
  return (
    <Group gap="2xs" mt="3xs">
      {entry.scope !== undefined && (
        <ScopeChips
          scope={scopeFromFields({ scope: entry.scope, ...(entry.places && { places: entry.places }) })}
          labels={known.labels}
          wrap="wrap"
        />
      )}
      {entry.acknowledges !== undefined && (
        <Text size="xs" c="dimmed">
          weighed {entry.acknowledges.length} similar
        </Text>
      )}
    </Group>
  );
}

/** One line of History: a decision, or a put-back and the decisions that undid it, read as one event. */
interface HistoryLine {
  readonly last: DecisionRecord;
  readonly headline: string;
  readonly color: string;
  /** The single decision whose scope and weighing show under the headline; none for an undone put-back. */
  readonly detail: DecisionRecord | undefined;
}

const sameScopeFields = (left: DecisionRecord, right: DecisionRecord): boolean =>
  left.scope === right.scope && (left.places ?? []).join("\n") === (right.places ?? []).join("\n");

/**
 * How many decisions after a put-back restore exactly where it stood before it, the way Undo writes
 * them: the same accept, the same reject, or an accept then a retract. Zero when they don't.
 */
const undoLengthAfterReopen = (decisions: ReadonlyArray<DecisionRecord>, reopenIndex: number): number => {
  const before = decisions[reopenIndex - 1];
  const [first, second] = decisions.slice(reopenIndex + 1);
  if (before === undefined || first === undefined) return 0;
  if (before.outcome === "accept") return first.outcome === "accept" && sameScopeFields(before, first) ? 1 : 0;
  if (before.outcome === "reject") return first.outcome === "reject" && first.reason === before.reason ? 1 : 0;
  if (before.outcome === "retract") return first.outcome === "accept" && second?.outcome === "retract" ? 2 : 0;
  return 0;
};

/** The decisions as History lines, oldest first. Every record stays on file; only the reading groups them. */
const historyLinesOf = (decisions: ReadonlyArray<DecisionRecord>): Array<HistoryLine> => {
  const lines: Array<HistoryLine> = [];
  for (let index = 0; index < decisions.length; index += 1) {
    const entry = decisions[index];
    if (entry === undefined) continue;
    const undone = entry.outcome === "reopen" ? undoLengthAfterReopen(decisions, index) : 0;
    const last = decisions[index + undone] ?? entry;
    lines.push(
      undone > 0
        ? { last, headline: "Put back, then undone", color: DECISION_BULLET_COLORS.reopen, detail: undefined }
        : {
            last,
            headline: decisionHeadline(entry, decisions[index - 1]),
            color: DECISION_BULLET_COLORS[entry.outcome],
            detail: entry,
          },
    );
    index += undone;
  }
  return lines;
};

/** Newest first, one line per event. Reasons show on hover only: the card quotes the one that governs. */
function DecisionHistory({ view, owner, known }: { view: DerivationView; owner: string; known: KnownPlaces }) {
  const newestFirst = historyLinesOf(view.decisions).toReversed();
  return (
    <Paper p="md">
      <Text size="sm" fw={600} mb="sm">
        History
      </Text>
      {/* Timeline marks items active by cloning its direct children, so Timeline.Item stays at the call site. */}
      <Timeline bulletSize={10} lineWidth={2} active={0}>
        {newestFirst.map((line) => (
          <Timeline.Item
            key={line.last.id}
            color={line.color}
            title={
              <Text size="sm" fw={600} title={line.detail?.reason}>
                {line.headline}
                <EntryWhen by={line.last.by} at={line.last.at} owner={owner} />
              </Text>
            }
          >
            {line.detail !== undefined && <DecisionEntryDetail entry={line.detail} known={known} />}
          </Timeline.Item>
        ))}
        <Timeline.Item
          color="gray"
          title={
            <Text size="sm" fw={600}>
              Proposed
              <EntryWhen by={view.derivation.proposed_by} at={view.proposedAt} owner={owner} />
            </Text>
          }
        />
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
  notedByCard,
}: {
  view: DerivationView;
  kind: DerivedKindView | undefined;
  detail: ShowResult;
  owner: string;
  known: KnownPlaces;
  notedByCard: string | undefined;
}) {
  const chain = revisionChainOf(view);
  return (
    <Stack gap="md">
      <DerivationProperties view={view} kind={kind} owner={owner} />
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
        items={detail.despitedBy.filter((item) => item.id !== notedByCard)}
      />
      <SidebarList
        title="Accepted despite this"
        explanation="You accepted these knowing they overlap it."
        items={detail.acknowledgedBy}
      />
    </Stack>
  );
}
