/**
 * A record's history as one feed, oldest first, in the manner of Plane's and Attio's activity: an icon
 * per event on a rail, "who did what · when" on one line, and what it carried (a reason, a scope change,
 * a note) underneath, in its place rather than behind a hover.
 */
import { Group, Text, Timeline } from "@mantine/core";
import type { ReactNode } from "react";

import { formatReviewTime } from "#review/shared/format.ts";

export interface ActivityTimelineEvent {
  readonly key: string;
  readonly icon: ReactNode;
  /** A Mantine colour name for the event's bullet. */
  readonly color: string;
  readonly actor: string;
  /** What happened, after the actor: "rejected it", "changed the reason". */
  readonly action: ReactNode;
  /** ISO time: the full time shows on hover. */
  readonly at: string;
  /** How the time reads in the feed, such as "3 days ago". */
  readonly when: string;
  readonly body?: ReactNode;
  /** An event that changed nothing in the end, such as a decision undone straight after: read quietly. */
  readonly muted?: boolean;
}

export function ActivityTimeline({ events }: { events: ReadonlyArray<ActivityTimelineEvent> }) {
  return (
    // Timeline marks items by cloning its direct children, so Timeline.Item stays at this call site.
    <Timeline bulletSize={22} lineWidth={1} color="gray">
      {events.map((event) => (
        <Timeline.Item
          key={event.key}
          bullet={event.icon}
          color={event.color}
          title={
            <Group gap="2xs" wrap="wrap" align="baseline">
              <Text size="sm" fw={event.muted === true ? 400 : 600} c={event.muted === true ? "dimmed" : "inherit"}>
                {event.actor}
              </Text>
              <Text size="sm" c={event.muted === true ? "dimmed" : "inherit"}>
                {event.action}
              </Text>
              <Text size="xs" c="dimmed" title={formatReviewTime(event.at)}>
                · {event.when}
              </Text>
            </Group>
          }
        >
          {event.body}
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
