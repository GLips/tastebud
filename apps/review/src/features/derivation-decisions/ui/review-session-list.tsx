import { Box, Badge, Group, Paper, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DecisionOutcome } from "@tastebud/core/taste-vocabulary";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatTimeAgo } from "#review/shared/format.ts";
import { KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import { useReviewSessionLog } from "./review-session-log.ts";
import { useReviewClockMs } from "./use-review-clock.ts";

/** A decision outcome as one past-tense word and its badge colour, wherever a decision is listed. */
export const DECISION_OUTCOME_LABELS: Record<DecisionOutcome, { readonly word: string; readonly color: string }> = {
  accept: { word: "Accepted", color: "teal" },
  reject: { word: "Rejected", color: "red" },
  retract: { word: "Retracted", color: "gray" },
  reopen: { word: "Put back", color: "blue" },
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

/** What this tab decided, newest first. Each row links to its page, where the decision can be changed. */
export function ReviewSessionList() {
  const nowMs = useReviewClockMs();
  const decisions = useReviewSessionLog();
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  if (decisions.length === 0) return null;
  return (
    <Stack gap="xxs">
      <Group gap="xxs">
        <Text size="sm" fw={600}>
          This session
        </Text>
        <SupportingText tier="faint">{decisions.length}</SupportingText>
      </Group>
      <Paper p={0}>
        {decisions.map((entry) => {
          const outcome = DECISION_OUTCOME_LABELS[entry.outcome];
          return (
            <Box key={entry.decisionId} {...stylex.props(styles.row)}>
              <KindGlyph catalog={catalog} kind={entry.kind} />
              <Badge size="xs" color={outcome.color} variant="light">
                {outcome.word}
              </Badge>
              <Text size="sm" truncate>
                {entry.statement}
              </Text>
              <ScopeChips scope={entry.effectiveScope} labels={known.labels} />
              <Group gap="xs" wrap="nowrap">
                <SupportingText tier="faint">{formatTimeAgo(entry.at, nowMs)}</SupportingText>
                <AnchorLink to="/derivations/$id" params={{ id: entry.derivationId }} size="xs">
                  Open
                </AnchorLink>
              </Group>
            </Box>
          );
        })}
      </Paper>
    </Stack>
  );
}
