import { Box, Group, Paper, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatTimeAgo } from "#review/shared/format.ts";
import { KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DerivationStatusBadge, ReasonChangedChip } from "#review/shared/ui/status-chips.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import { useNetReviewSession } from "./review-session-log.ts";
import { useReviewClockMs } from "./use-review-clock.ts";

const styles = stylex.create({
  // Scrolls inside the popover, which stays within the viewport however long the session.
  list: { maxHeight: "min(480px, calc(100dvh - 200px))", overflowY: "auto", overscrollBehavior: "contain" },
  row: {
    display: "grid",
    gridTemplateColumns: "12px 112px minmax(0, 1fr) auto auto",
    columnGap: "10px",
    alignItems: "start",
    paddingBlock: "6px",
    paddingInline: "12px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: { default: "var(--mantine-color-gray-1)", ":first-child": "transparent" },
  },
  glyph: { paddingTop: "4px" },
});

/** What this tab changed, newest first, one line per derivation. Each links to its page, where it can be changed again. */
export function ReviewSessionList() {
  const nowMs = useReviewClockMs();
  const decisions = useNetReviewSession();
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
      <Paper p={0} {...stylex.props(styles.list)}>
        {decisions.map((entry) => (
          <Box key={entry.derivationId} {...stylex.props(styles.row)}>
            <Box {...stylex.props(styles.glyph)}>
              <KindGlyph catalog={catalog} kind={entry.kind} />
            </Box>
            {/* A changed reason leaves the status as it was, so it is an event, not a status badge. */}
            {entry.reasonChanged ? <ReasonChangedChip /> : <DerivationStatusBadge status={entry.status} />}
            <Text size="sm">{entry.statement}</Text>
            <ScopeChips scope={entry.effectiveScope} labels={known.labels} />
            <Group gap="xs" wrap="nowrap">
              <SupportingText tier="faint">{formatTimeAgo(entry.at, nowMs)}</SupportingText>
              <AnchorLink to="/derivations/$id" params={{ id: entry.derivationId }} size="xs">
                Open
              </AnchorLink>
            </Group>
          </Box>
        ))}
      </Paper>
    </Stack>
  );
}
