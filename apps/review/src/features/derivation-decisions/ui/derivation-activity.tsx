/** A derivation's Activity section: proposal, decisions and notes in one feed, with the note composer at its foot. */
import { Anchor, Collapse, Group, Paper, Stack, Text, ThemeIcon } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import type { DerivationView } from "@tastebud/core/record-views";
import type { DecisionRecord } from "@tastebud/core/records";
import type { ListenerHeartbeat } from "@tastebud/core/review-threads";
import { shortIdOf } from "@tastebud/core/taste-vocabulary";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Inbox,
  type LucideIcon,
  MessageSquare,
  PencilLine,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { recordDetailQuery } from "#review/features/review-shell/index.ts";
import { describeAuthor, formatTimeAgo } from "#review/shared/format.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { ActivityTimeline, type ActivityTimelineEvent } from "#review/shared/ui/activity-timeline.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

import { DerivationSection } from "./derivation-header.tsx";
import { type DerivationHistoryEvent, derivationHistoryOf, stateSettingDecisionOf } from "./derivation-history.ts";
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

/** A near repeat an accept weighed, by its statement, linked; the decision keeps only its id. */
function WeighedRecordLink({ id }: { id: string }) {
  const statement = useQuery(recordDetailQuery(id)).data?.derivation?.statement;
  return (
    <AnchorLink to="/derivations/$id" params={{ id }} size="sm" underline="hover" lineClamp={1}>
      {statement ?? shortIdOf(id)}
    </AnchorLink>
  );
}

/** The reason the rail already shows, behind a disclosure so the feed doesn't say it twice. */
function FoldedReason({ reason }: { reason: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="3xs" mt="3xs">
      <Anchor component="button" size="xs" c="dimmed" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Group gap="3xs" wrap="nowrap" component="span">
          {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
          Reason
        </Group>
      </Anchor>
      <Collapse expanded={open}>
        <Text size="sm" {...stylex.props(styles.prose)}>
          “{reason}”
        </Text>
      </Collapse>
    </Stack>
  );
}

function DecisionEventBody({
  event,
  known,
  foldReason,
}: {
  event: Extract<DerivationHistoryEvent, { type: "decision" }>;
  known: KnownPlaces;
  /** The event that set the current state: its reason is in the rail, so it folds here. */
  foldReason: boolean;
}) {
  return (
    <>
      {event.reason !== undefined && foldReason && <FoldedReason reason={event.reason} />}
      {event.reason !== undefined && !foldReason && (
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
      {event.weighed.length > 0 && (
        <EventField label="Weighed">
          <Stack gap="3xs">
            {event.weighed.map((id) => (
              <WeighedRecordLink key={id} id={id} />
            ))}
          </Stack>
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
  stateSetterId: string | undefined,
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
      // An undone decision and a reason edit change no state, so neither wears the state's colour.
      const look =
        event.undone || event.reasonEdit
          ? { ...DECISION_LOOKS[event.outcome], color: "gray" }
          : DECISION_LOOKS[event.outcome];
      const icon = event.reasonEdit ? PencilLine : look.icon;
      return {
        ...base,
        icon: <EventIcon icon={icon} color={look.color} />,
        color: look.color,
        action: event.action,
        muted: event.undone,
        body: event.undone ? undefined : (
          <DecisionEventBody event={event} known={known} foldReason={event.id === stateSetterId} />
        ),
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
  const stateSetterId = stateSettingDecisionOf(view)?.id;
  const events = derivationHistoryOf(view).map((event) => timelineEventOf(event, owner, known, nowMs, stateSetterId));
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
