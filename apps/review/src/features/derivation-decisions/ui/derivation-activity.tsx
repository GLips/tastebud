/** A derivation's Activity section: proposal, decisions and notes in one feed, with the note composer at its foot. */
import { Group, Paper, Stack, Text, ThemeIcon } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationView } from "@tastebud/core/record-views";
import type { DecisionRecord } from "@tastebud/core/records";
import type { ListenerHeartbeat } from "@tastebud/core/review-threads";
import { ArrowRight, Check, Inbox, type LucideIcon, MessageSquare, PencilLine, Sparkles, Undo2, X } from "lucide-react";
import type { ReactNode } from "react";

import { describeAuthor, formatTimeAgo } from "#review/shared/format.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { ActivityTimeline, type ActivityTimelineEvent } from "#review/shared/ui/activity-timeline.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";

import { DerivationSection } from "./derivation-header.tsx";
import { type DerivationHistoryEvent, derivationHistoryOf } from "./derivation-history.ts";
import { DerivationNoteComposer } from "./derivation-thread.tsx";
import { useReviewClockMs } from "./use-review-clock.ts";

const styles = stylex.create({
  prose: { whiteSpace: "pre-wrap" },
});

const DECISION_LOOKS: Record<DecisionRecord["outcome"], { readonly icon: LucideIcon; readonly color: string }> = {
  accept: { icon: Check, color: "teal" },
  reject: { icon: X, color: "red" },
  retract: { icon: Undo2, color: "gray" },
  reopen: { icon: Inbox, color: "blue" },
};

function EventIcon({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <ThemeIcon size="sm" radius="xl" variant="light" color={color}>
      <Icon size={12} aria-hidden />
    </ThemeIcon>
  );
}

/** A labelled value under an event: "Reason “…”", "Scope Everywhere → acme/web". */
function EventField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="baseline" mt="3xs">
      <Text size="xs" c="dimmed" fw={500}>
        {label}
      </Text>
      {children}
    </Group>
  );
}

function DecisionEventBody({
  event,
  known,
}: {
  event: Extract<DerivationHistoryEvent, { type: "decision" }>;
  known: KnownPlaces;
}) {
  return (
    <>
      {event.reason !== undefined && (
        <EventField label="Reason">
          <Text size="sm" {...stylex.props(styles.prose)}>
            “{event.reason}”
          </Text>
        </EventField>
      )}
      {event.scopeChange !== undefined && (
        <EventField label="Scope">
          <Group gap="2xs" wrap="wrap">
            <ScopeChips scope={event.scopeChange.from} labels={known.labels} />
            <ArrowRight size={12} aria-hidden />
            <ScopeChips scope={event.scopeChange.to} labels={known.labels} />
          </Group>
        </EventField>
      )}
      {event.weighed > 0 && (
        <EventField label="Weighed">
          <Text size="sm">
            {event.weighed} similar {event.weighed === 1 ? "record" : "records"}
          </Text>
        </EventField>
      )}
    </>
  );
}

const timelineEventOf = (
  event: DerivationHistoryEvent,
  owner: string,
  known: KnownPlaces,
  nowMs: number,
): ActivityTimelineEvent => {
  const base = {
    key: event.id,
    actor: describeAuthor(event.by, owner),
    at: event.at,
    when: formatTimeAgo(event.at, nowMs),
  };
  switch (event.type) {
    case "proposed":
      return { ...base, icon: <EventIcon icon={Sparkles} color="gray" />, color: "gray", action: "proposed it" };
    case "note":
      return {
        ...base,
        icon: <EventIcon icon={MessageSquare} color="gray" />,
        color: "gray",
        action: "left a note",
        body: (
          <Paper px="sm" py="xs" mt="2xs">
            <Text size="sm" {...stylex.props(styles.prose)}>
              {event.text}
            </Text>
          </Paper>
        ),
      };
    case "decision": {
      const look = DECISION_LOOKS[event.outcome];
      const icon = event.action === "changed the reason" ? PencilLine : look.icon;
      return {
        ...base,
        icon: <EventIcon icon={icon} color={look.color} />,
        color: look.color,
        action: event.action,
        body: <DecisionEventBody event={event} known={known} />,
      };
    }
  }
};

export function DerivationActivity({
  view,
  owner,
  known,
  listeners,
  focusComposer,
  id,
}: {
  view: DerivationView;
  owner: string;
  known: KnownPlaces;
  listeners: ReadonlyArray<ListenerHeartbeat>;
  focusComposer: boolean;
  /** The anchor a Discuss link scrolls to. */
  id?: string;
}) {
  const nowMs = useReviewClockMs();
  const events = derivationHistoryOf(view).map((event) => timelineEventOf(event, owner, known, nowMs));
  return (
    <DerivationSection title="Activity" id={id}>
      <Stack gap="md">
        <ActivityTimeline events={events} />
        <DerivationNoteComposer
          derivationId={view.id}
          owner={owner}
          listeners={listeners}
          focusComposer={focusComposer}
        />
      </Stack>
    </DerivationSection>
  );
}
