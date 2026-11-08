/**
 * What sits beside the inbox queue: this tab's decisions and the triage keys, always in view on a wide
 * screen so neither hides behind hover or the bottom of a long queue. Below `md` the rail is hidden and
 * the same two things open from buttons in the page header instead.
 */
import { Badge, Box, Button, Group, Kbd, Popover, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DecisionOutcome } from "@tastebud/core/taste-vocabulary";
import { History, Keyboard } from "lucide-react";

import { formatTimeAgo } from "#review/shared/format.ts";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

import { ReviewSessionList } from "./review-session-list.tsx";
import { useReviewSessionLog } from "./review-session-log.ts";
import { useReviewClockMs } from "./use-review-clock.ts";

const styles = stylex.create({
  // Clears the shell's sticky 48px header; the shell doesn't expose that height, so it is repeated here.
  rail: { width: "300px", flexShrink: 0, position: "sticky", top: "64px" },
  keys: { display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "10px", rowGap: "6px", alignItems: "center" },
  decision: { display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "8px", alignItems: "baseline" },
});

const INBOX_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["j / k", "Next / previous"],
  ["a", "Accept, or review first if needed"],
  ["s", "Edit where it applies"],
  ["r", "Reject with a reason"],
  ["d", "Discuss with an agent"],
  ["⌘↵ / Esc", "Confirm / back, in a preview"],
];

const OUTCOME_LABELS: Record<DecisionOutcome, { readonly word: string; readonly color: string }> = {
  accept: { word: "Accepted", color: "teal" },
  reject: { word: "Rejected", color: "red" },
  retract: { word: "Retracted", color: "gray" },
};

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

function RailHeading({ children }: { children: string }) {
  return (
    <Text size="xs" c="dimmed" fw={600} tt="uppercase">
      {children}
    </Text>
  );
}

function SessionDecisionsRail() {
  const nowMs = useReviewClockMs();
  const decisions = useReviewSessionLog();
  return (
    <Stack gap="xs">
      <RailHeading>Decided in this tab</RailHeading>
      {decisions.length === 0 ? (
        <Text size="xs" c="dimmed">
          Nothing yet. Each decision lands here with a link to it, so you can check or change it later.
        </Text>
      ) : (
        decisions.map((entry) => {
          const outcome = OUTCOME_LABELS[entry.outcome];
          return (
            <Box key={entry.derivationId} {...stylex.props(styles.decision)}>
              <Badge size="xs" color={outcome.color}>
                {outcome.word}
              </Badge>
              <Stack gap="3xs">
                <AnchorLink
                  to="/derivations/$id"
                  params={{ id: entry.derivationId }}
                  size="sm"
                  c="inherit"
                  lineClamp={2}
                >
                  {entry.statement}
                </AnchorLink>
                <Text size="xs" c="dimmed">
                  {formatTimeAgo(entry.at, nowMs)}
                </Text>
              </Stack>
            </Box>
          );
        })
      )}
    </Stack>
  );
}

export function InboxRail() {
  return (
    <Stack gap="xl" visibleFrom="md" {...stylex.props(styles.rail)}>
      <SessionDecisionsRail />
      <Stack gap="xs">
        <RailHeading>Keys</RailHeading>
        <InboxKeyList />
      </Stack>
    </Stack>
  );
}

/** The rail's contents as header buttons, for screens too narrow to show the rail. */
export function InboxNarrowActions() {
  const decided = useReviewSessionLog().length;
  return (
    <Group gap="2xs" wrap="nowrap" hiddenFrom="md">
      {decided > 0 && (
        <Popover withArrow position="bottom-end" shadow="md" width={640}>
          <Popover.Target>
            <Button variant="subtle" color="gray" leftSection={<History size={14} />}>
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
