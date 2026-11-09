/**
 * The Related section: every derivation this one stands in a relation to, one linked row each. The
 * replacement chain reads oldest to newest, then what it builds on or cuts against, then later records
 * that point back at it. A record that holds several relations shows once, under the first.
 */
import { Paper, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationSummary, DerivationView, ShowResult } from "@tastebud/core/record-views";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { DerivationRelationRow } from "#review/shared/ui/derivation-relation-row.tsx";

import { DerivationSection } from "./derivation-header.tsx";

const styles = stylex.create({
  prose: { whiteSpace: "pre-wrap" },
});

interface DerivationRelation {
  readonly relation: string;
  readonly summary: DerivationSummary;
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

const relationsOf = (view: DerivationView, backlinks: DerivationBacklinks): Array<DerivationRelation> => {
  const despiteCase = view.derivation.despite_case;
  const relations: Array<DerivationRelation> = [
    ...view.ancestors.map((summary) => ({
      relation: summary.id === view.supersedes?.id ? "Replaces" : "Earlier version",
      summary,
    })),
    ...view.revisions.map((summary) => ({
      relation: summary.status === "accepted" ? "Replaced by" : "Newer version",
      summary,
    })),
    ...view.despite.map((summary, index) => ({
      relation: summary.status === "rejected" ? "Close to a rejection" : "Close to",
      summary,
      ...(index === view.despite.length - 1 && despiteCase !== undefined && { agentCase: despiteCase }),
    })),
    ...view.supportingDerivations.map((summary) => ({ relation: "Builds on", summary })),
    ...view.contradictingDerivations.map((summary) => ({ relation: "Says the opposite", summary })),
    ...(backlinks.despitedBy ?? []).map((summary) => ({ relation: "Proposed despite this", summary })),
    ...(backlinks.citedBy ?? []).map((summary) => ({ relation: "Built on this", summary })),
    ...(backlinks.acknowledgedBy ?? []).map((summary) => ({ relation: "Accepted despite this", summary })),
    ...(backlinks.nearRepeats ?? []).map((summary) => ({ relation: "Near repeat", summary })),
    ...(backlinks.similar ?? []).map((summary) => ({ relation: "Similar", summary })),
  ];
  const seen = new Set<string>([view.id]);
  return relations.filter((entry) => {
    if (seen.has(entry.summary.id)) return false;
    seen.add(entry.summary.id);
    return true;
  });
};

export function DerivationRelated({
  view,
  backlinks,
  known,
}: {
  view: DerivationView;
  backlinks: DerivationBacklinks;
  known: KnownPlaces;
}) {
  const catalog = useReviewCatalog();
  const relations = relationsOf(view, backlinks);
  if (relations.length === 0) return null;
  return (
    <DerivationSection title="Related">
      <Paper>
        {relations.map((entry) => (
          <DerivationRelationRow
            key={entry.summary.id}
            relation={entry.relation}
            summary={entry.summary}
            catalog={catalog}
            labels={known.labels}
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
