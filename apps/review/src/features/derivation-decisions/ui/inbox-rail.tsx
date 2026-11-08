/**
 * What sits beside the inbox queue: this tab's decisions, once there are any, kept in view on a wide
 * screen. The triage keys open from a Shortcuts button in the page header on every width, and below
 * `md` the decisions open from the header too.
 */
import { Badge, Box, Button, Group, Kbd, Popover, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { History, Keyboard } from "lucide-react";

import { formatTimeAgo } from "#review/shared/format.ts";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

import { DECISION_OUTCOME_LABELS, ReviewSessionList } from "./review-session-list.tsx";
import { useReviewSessionLog } from "./review-session-log.ts";
import { useReviewClockMs } from "./use-review-clock.ts";

const styles = stylex.create({
  rail: {
    width: "300px",
    flexShrink: 0,
    position: "sticky",
    top: "calc(var(--review-shell-header-height) + 16px)",
  },
  keys: { display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "10px", rowGap: "6px", alignItems: "center" },
  decision: { display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "8px", alignItems: "baseline" },
});

const INBOX_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["j / k", "Next / previous"],
  ["a", "Accept, or review first if needed"],
  ["s", "Edit where it applies"],
  ["r", "Reject with a reason"],
  ["d", "Write a note to the agents"],
  ["⌘↵ / Esc", "Confirm / back, in a preview or note"],
];

function InboxKeyList() {
  return (
    <Box {...stylex.props(styles.keys)}>
      {INBOX_KEYS.map(([keys, action]) => [
        <Kbd key={`${keys}-k`} size="xs">
          {keys}
        </Kbd>,
        <Text size="xs" key={`${keys}-a`}>
          {action}
        </Text>,
      ])}
    </Box>
  );
}

/** Hidden until something is decided: an empty rail would only take width from the queue. */
export function InboxRail() {
  const nowMs = useReviewClockMs();
  const decisions = useReviewSessionLog();
  if (decisions.length === 0) return null;
  return (
    <Stack gap="xs" visibleFrom="md" {...stylex.props(styles.rail)}>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase">
        Decided in this tab
      </Text>
      {decisions.map((entry) => {
        const outcome = DECISION_OUTCOME_LABELS[entry.outcome];
        return (
          <Box key={entry.derivationId} {...stylex.props(styles.decision)}>
            <Badge size="xs" color={outcome.color}>
              {outcome.word}
            </Badge>
            <Stack gap="3xs">
              <AnchorLink to="/derivations/$id" params={{ id: entry.derivationId }} size="sm" c="inherit" lineClamp={2}>
                {entry.statement}
              </AnchorLink>
              <Text size="xs" c="dimmed">
                {formatTimeAgo(entry.at, nowMs)}
              </Text>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

/** The page header's buttons: the keys on every width, and this tab's decisions where the rail is hidden. */
export function InboxHeaderActions() {
  const decided = useReviewSessionLog().length;
  return (
    <Group gap="2xs" wrap="nowrap">
      {decided > 0 && (
        <Popover withArrow position="bottom-end" shadow="md" width={640}>
          <Popover.Target>
            <Button variant="subtle" color="gray" leftSection={<History size={14} />} hiddenFrom="md">
              Decided this session · {decided}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <ReviewSessionList />
          </Popover.Dropdown>
        </Popover>
      )}
      <Popover withArrow position="bottom-end" shadow="md">
        <Popover.Target>
          <Button variant="subtle" color="gray" leftSection={<Keyboard size={14} />}>
            Shortcuts
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <InboxKeyList />
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
