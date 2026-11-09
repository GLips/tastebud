import { Box, Badge, Group, Paper, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DecisionOutcome, DerivationStatus } from "@tastebud/core/taste-vocabulary";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatTimeAgo } from "#review/shared/format.ts";
import { KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DerivationStatusBadge } from "#review/shared/ui/status-chips.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import { useReviewSessionLog } from "./review-session-log.ts";
import { useReviewClockMs } from "./use-review-clock.ts";

/** The status a decision leaves its derivation in, so a listed decision wears that status's badge. */
export const STATUS_AFTER_OUTCOME: Record<DecisionOutcome, DerivationStatus> = {
  accept: "accepted",
  reject: "rejected",
  retract: "retracted",
  reopen: "pending",
};

const styles = stylex.create({
  row: {
    display: "grid",
    gridTemplateColumns: "12px 112px minmax(0, 1fr) auto auto",
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
          return (
            <Box key={entry.decisionId} {...stylex.props(styles.row)}>
              <KindGlyph catalog={catalog} kind={entry.kind} />
              {/* A changed reason leaves the status as it was, so it is an event, not a status badge. */}
              {entry.reasonChanged ? (
                <Badge color="gray">Reason changed</Badge>
              ) : (
                <DerivationStatusBadge status={STATUS_AFTER_OUTCOME[entry.outcome]} />
              )}
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
