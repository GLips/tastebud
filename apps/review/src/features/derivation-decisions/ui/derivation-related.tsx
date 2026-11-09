/**
 * How this derivation relates to others, in three groups of linked rows. Versions is a stack: earlier
 * versions above, this one as the bold parent line, and later proposals that replace it or were made
 * despite it hanging under it as children. Conflicts holds what contradicts it or comes close to a
 * rejection; Linked holds evidence links and near matches. A record shows once, in its first group.
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
  readonly relation: string;
  /** A conflict shows as its caution chip in place of the relation word. */
  readonly caution?: DerivationCaution;
  readonly summary: DerivationSummary;
  readonly place?: DerivationRelationPlace | undefined;
  /** The agent's case for proposing again, under the earlier record it answers. */
  readonly agentCase?: string;
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
  const earlier = firstSeen(view.ancestors.map((summary) => ({ relation: "Earlier version", summary })));
  const newer = firstSeen(
    [...view.revisions, ...(backlinks.despitedBy ?? [])].map((summary) => ({
      relation: "Newer version",
      summary,
      place: "child" as const,
    })),
  );
  const despiteCase = view.derivation.despite_case;
  const conflicts = firstSeen([
    ...view.despite.map((summary, index) => ({
      relation: "Near",
      ...(summary.status === "rejected" && { caution: "near-a-rejection" as const }),
      summary,
      ...(index === view.despite.length - 1 && despiteCase !== undefined && { agentCase: despiteCase }),
    })),
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
    ...(backlinks.similar ?? []).map((summary) => ({ relation: "Similar", summary })),
  ]);
  const versions: ReadonlyArray<DerivationRelation> =
    earlier.length + newer.length === 0
      ? []
      : [...earlier, { relation: "This one", summary: view, place: "current" }, ...newer];
  return { versions, conflicts, linked };
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
            relation={entry.relation}
            relationChip={entry.caution === undefined ? undefined : <CautionChip caution={entry.caution} />}
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
  const { versions, conflicts, linked } = relationGroupsOf(view, backlinks);
  return (
    <>
      <RelationGroup title="Versions" relations={versions} known={known} />
      <RelationGroup title="Conflicts" relations={conflicts} known={known} />
      <RelationGroup title="Linked" relations={linked} known={known} />
    </>
  );
}
