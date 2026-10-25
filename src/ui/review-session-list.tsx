import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";

import type { DecisionOutcome } from "../shared/vocabulary.ts";
import { formatTimeAgo } from "./format.ts";
import { KindGlyph } from "./kind-identity.tsx";
import { ScopeChips } from "./place-chips.tsx";
import { useReviewSessionLog } from "./review-session-log.ts";
import { AnchorLink } from "./router-links.tsx";
import { useKnownPlaces, useReviewCatalog } from "./use-review-context.ts";

const OUTCOME_LABELS: Record<DecisionOutcome, { readonly word: string; readonly color: string }> = {
  accept: { word: "Accepted", color: "teal" },
  reject: { word: "Rejected", color: "red" },
  retract: { word: "Retracted", color: "gray" },
};

const styles = stylex.create({
  row: {
    display: "grid",
    gridTemplateColumns: "12px 72px minmax(0, 1fr) auto auto",
    columnGap: "10px",
    alignItems: "center",
    paddingBlock: "6px",
    paddingInline: "12px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: { default: "var(--mantine-color-gray-1)", ":first-child": "transparent" },
  },
});

/** What this tab decided, newest first. Decisions are final, so each row links to its decision. */
export function ReviewSessionList() {
  const decisions = useReviewSessionLog();
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  if (decisions.length === 0) return null;
  return (
    <Stack gap={6}>
      <Group gap={6}>
        <Text size="sm" fw={600}>
          This session
        </Text>
        <Text size="xs" c="dimmed">
          {decisions.length}
        </Text>
      </Group>
      <Paper p={0}>
        {decisions.map((entry) => {
          const outcome = OUTCOME_LABELS[entry.outcome];
          return (
            <div key={entry.derivationId} {...stylex.props(styles.row)}>
              <KindGlyph catalog={catalog} kind={entry.kind} />
              <Badge size="xs" color={outcome.color} variant="light">
                {outcome.word}
              </Badge>
              <Text size="sm" truncate>
                {entry.statement}
              </Text>
              <ScopeChips scope={entry.effectiveScope} labels={known.labels} />
              <Group gap={8} wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {formatTimeAgo(entry.at)}
                </Text>
                <AnchorLink to="/derivations/$id" params={{ id: entry.derivationId }} size="xs">
                  View decision
                </AnchorLink>
              </Group>
            </div>
          );
        })}
      </Paper>
    </Stack>
  );
}
