/**
 * The inbox header's buttons: the triage keys, and this tab's decisions once there are any. Both open
 * on click, so neither hides behind hover or takes width from the queue and its detail pane.
 */
import { Box, Button, Group, Kbd, Popover, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { History, Keyboard } from "lucide-react";
import { useState } from "react";

import { ReviewSessionList } from "./review-session-list.tsx";
import { useNetReviewSession } from "./review-session-log.ts";

const styles = stylex.create({
  keys: { display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "10px", rowGap: "6px", alignItems: "center" },
});

const INBOX_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["j / k", "Next / previous"],
  ["a", "Believe, or every selected row as proposed"],
  ["s", "Edit where it applies"],
  ["r", "Reject with a reason, one or the selection"],
  ["d", "Write in the thread to the agents"],
  ["u", "Undo the latest decision"],
  ["x / ⇧-click", "Select one / a range, to decide together"],
  ["Esc", "Clear the selection"],
  ["↵ / o", "Open the full page"],
  ["⌘↵ / Esc", "Confirm / back, in a preview or note"],
  ["?", "Show these keys"],
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

export function InboxHeaderActions() {
  const decided = useNetReviewSession().length;
  const [keysOpen, setKeysOpen] = useState(false);
  // `?` is Shift+/ on the keyboards this is written for.
  useHotkeys([{ hotkey: { key: "/", shift: true }, callback: () => setKeysOpen((open) => !open) }]);
  return (
    <Group gap="2xs" wrap="nowrap">
      {decided > 0 && (
        <Popover withArrow position="bottom-end" shadow="md" width={640} trapFocus returnFocus>
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
      <Popover
        opened={keysOpen}
        onChange={setKeysOpen}
        withArrow
        position="bottom-end"
        shadow="md"
        trapFocus
        returnFocus
      >
        <Popover.Target>
          <Button
            variant="subtle"
            color="gray"
            leftSection={<Keyboard size={14} />}
            onClick={() => setKeysOpen((open) => !open)}
          >
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
