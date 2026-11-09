/**
 * How this derivation relates to others, in groups of title-first rows. Earlier versions come first;
 * Newer versions is a stack, this one as the bold parent and later proposals that replace it or were
 * made despite it hanging under it on a rail. Conflicts holds what contradicts or reverses it or comes
 * close to a rejection; Linked holds evidence links, shared words and near matches. A record shows
 * once, in its first group.
 */
import { Paper, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationSummary, DerivationView, ShowResult } from "@tastebud/core/record-views";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { CautionChip, type DerivationCaution } from "#review/shared/ui/caution-chip.tsx";
import { DerivationRelationRow, type DerivationRelationPlace } from "#review/shared/ui/derivation-relation-row.tsx";

import { DerivationSection } from "./derivation-header.tsx";

const styles = stylex.create({
  prose: { whiteSpace: "pre-wrap" },
});

interface DerivationRelation {
  /** How it relates, as a trailing word; empty where the group's header says it. */
  readonly relation?: string;
  /** A conflict shows as its caution chip in place of the relation word. */
  readonly caution?: DerivationCaution;
  readonly summary: DerivationSummary;
  readonly place?: DerivationRelationPlace | undefined;
  /** The agent's case for proposing again, under the earlier record it answers. */
  readonly agentCase?: string | undefined;
}

/** What the page's detail adds about records pointing back; the inbox adds its near matches. */
export type DerivationBacklinks = Partial<Pick<ShowResult, "despitedBy" | "citedBy" | "acknowledgedBy">> & {
  /** Close records under the proposed scope that an accept must weigh. */
  readonly nearRepeats?: ReadonlyArray<DerivationSummary>;
  /** Other similar records of the kind, any status. */
  readonly similar?: ReadonlyArray<DerivationSummary>;
};

const relationGroupsOf = (view: DerivationView, backlinks: DerivationBacklinks) => {
  const seen = new Set<string>([view.id]);
  const firstSeen = (entries: ReadonlyArray<DerivationRelation>) =>
    entries.filter((entry) => {
      if (seen.has(entry.summary.id)) return false;
      seen.add(entry.summary.id);
      return true;
    });
  const earlier = firstSeen(view.ancestors.map((summary) => ({ summary })));
  const newer = firstSeen(
    [...view.revisions, ...(backlinks.despitedBy ?? [])].map((summary) => ({
      summary,
      place: "child" as const,
    })),
  );
  // Read from each record's state now: once a rejection is undone or reversed, it is only similar,
  // and the agent's case against it no longer answers anything.
  const stillRejected = view.despite.filter((summary) => summary.status === "rejected");
  const despiteCase = view.derivation.despite_case;
  const conflicts = firstSeen([
    ...stillRejected.map((summary, index) => ({
      relation: "Near a rejection",
      caution: "near-a-rejection" as const,
      summary,
      agentCase: index === stillRejected.length - 1 ? despiteCase : undefined,
    })),
    ...view.reverses.map((summary) => ({ relation: "Reverses", summary })),
    ...view.reversedBy.map((summary) => ({ relation: "Reversed by", summary })),
    ...view.contradictingDerivations.map((summary) => ({
      relation: "Says the opposite",
      summary,
      caution: "says-the-opposite" as const,
    })),
    ...(backlinks.nearRepeats ?? []).map((summary) => ({
      relation: "Near repeat",
      summary,
      caution: "near-a-repeat" as const,
    })),
  ]);
  const linked = firstSeen([
    ...view.supportingDerivations.map((summary) => ({ relation: "Builds on", summary })),
    ...(backlinks.citedBy ?? []).map((summary) => ({ relation: "Built on this", summary })),
    ...(backlinks.acknowledgedBy ?? []).map((summary) => ({ relation: "Accepted despite this", summary })),
    ...view.fromSameWords.map((summary) => ({ relation: "From the same words", summary })),
    ...[...view.despite, ...(backlinks.similar ?? [])].map((summary) => ({ relation: "Similar", summary })),
  ]);
  const lineage: ReadonlyArray<DerivationRelation> =
    newer.length === 0 ? [] : [{ summary: view, place: "current" }, ...newer];
  return { earlier, lineage, conflicts, linked };
};

function RelationGroup({
  title,
  relations,
  known,
}: {
  title: string;
  relations: ReadonlyArray<DerivationRelation>;
  known: KnownPlaces;
}) {
  const catalog = useReviewCatalog();
  if (relations.length === 0) return null;
  return (
    <DerivationSection title={title}>
      <Paper>
        {relations.map((entry) => (
          <DerivationRelationRow
            key={entry.summary.id}
            tag={entry.caution === undefined ? entry.relation : <CautionChip caution={entry.caution} />}
            summary={entry.summary}
            catalog={catalog}
            labels={known.labels}
            place={entry.place}
          >
            {entry.agentCase !== undefined && (
              <Text size="xs" c="gray.7" {...stylex.props(styles.prose)}>
                <Text span inherit c="dimmed">
                  Agent&apos;s case{" "}
                </Text>
                {entry.agentCase}
              </Text>
            )}
          </DerivationRelationRow>
        ))}
      </Paper>
    </DerivationSection>
  );
}

export function DerivationRelated({
  view,
  backlinks,
  known,
}: {
  view: DerivationView;
  backlinks: DerivationBacklinks;
  known: KnownPlaces;
}) {
  const { earlier, lineage, conflicts, linked } = relationGroupsOf(view, backlinks);
  return (
    <>
      <RelationGroup title="Earlier versions" relations={earlier} known={known} />
      <RelationGroup title="Newer versions" relations={lineage} known={known} />
      <RelationGroup title="Conflicts" relations={conflicts} known={known} />
      <RelationGroup title="Linked" relations={linked} known={known} />
    </>
  );
}
