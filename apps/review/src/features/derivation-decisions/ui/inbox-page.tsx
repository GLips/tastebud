import { Box, Button, Center, Group, Loader, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Schema } from "effect";
import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { reviewShellQuery, useKnownPlaces } from "#review/features/review-shell/index.ts";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";

import { inboxGroupsQuery } from "./decision-queries.ts";
import { InboxProposalCard } from "./inbox-card.tsx";
import type { InboxDecidedRowLatest } from "./inbox-decided-row.tsx";
import { InboxEmptyKind } from "./inbox-empty-kind.tsx";
import { GoneProposalRow, InboxGroupSection } from "./inbox-group-section.tsx";
import { InboxHeaderActions } from "./inbox-header-actions.tsx";
import { InboxKindTabs } from "./inbox-kind-tabs.tsx";
import { type InboxQueueEntry, useStableInboxQueue } from "./inbox-queue.ts";
import { useInboxCardStates } from "./use-inbox-card-states.ts";
import type { InboxBatch, InboxCardHandle } from "./use-inbox-card-triage.ts";
import { useInboxKind } from "./use-inbox-kind.ts";
import { useInboxSelection } from "./use-inbox-selection.ts";

/** `card` selects one proposal on arrival, for links that name a specific pending item. */
export const InboxSearch = Schema.Struct({
  kind: Schema.optionalKey(Schema.String),
  card: Schema.optionalKey(Schema.String),
});

const Route = getRouteApi("/");

const styles = stylex.create({
  alignCenter: { alignSelf: "center" },
  queue: { flexBasis: "44%", flexShrink: 0, minWidth: 0 },
  // Sticks below the shell header and scrolls on its own, so the selected proposal's buttons and
  // evidence stay in view however far down the queue the reviewer is.
  pane: {
    flex: 1,
    minWidth: 0,
    position: "sticky",
    top: "calc(var(--review-shell-header-height) + 16px)",
    maxHeight: "calc(100dvh - var(--review-shell-header-height) - 32px)",
    overflowY: "auto",
    overscrollBehavior: "contain",
  },
});

export function InboxPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const shell = useQuery(reviewShellQuery);
  const inbox = useQuery(inboxGroupsQuery);
  const known = useKnownPlaces();
  const catalog = shell.data?.catalog;
  const kinds = catalog?.derivedKinds ?? [];
  const { kind, pendingByKind } = useInboxKind(kinds, inbox.data?.groups, search.kind);
  const queue = useStableInboxQueue(inbox.data?.groups, kind?.key ?? "");
  const cards = useInboxCardStates();
  // Cards decided here stay where they were, folded to their outcome with Undo, but j/k skip them.
  const order = queue.entries.filter((entry) => !cards.decidedIds.has(entry.id)).map((entry) => entry.id);
  const selection = useInboxSelection({
    order,
    linkedCard: search.card,
    holdsKeyboard: (id) => cards.engagedIds.has(id),
  });
  const cardHandles = useRef(new Map<string, InboxCardHandle>()).current;
  const [pane, setPane] = useState<HTMLDivElement | null>(null);

  if (shell.error) return <QueryErrorAlert error={shell.error} />;
  if (inbox.error) return <QueryErrorAlert error={inbox.error} />;
  if (inbox.data === undefined || kind === undefined) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  const kindsProps = {
    catalog,
    kinds,
    kind,
    pendingByKind,
    onShowKind: (key: string) => void navigate({ search: { kind: key }, replace: true }),
  };
  // A batch decides through each card; a card no longer mounted (its kind was switched away mid-batch) is skipped.
  const acceptOne = async (id: string, batch: InboxBatch) => {
    const handle = cardHandles.get(id);
    return handle === undefined
      ? "Left undecided: the inbox moved to another kind before its turn."
      : handle.acceptAsProposed(batch);
  };
  // One at a time, newest first: the reverse of the order they were decided in.
  const undoInTurn = async ([id, ...rest]: ReadonlyArray<string>): Promise<void> => {
    if (id === undefined) return;
    await cardHandles.get(id)?.undo();
    await undoInTurn(rest);
  };
  const latestIds = cards.latestDecidedIds;
  const latestOf = (id: string): InboxDecidedRowLatest | undefined =>
    latestIds.includes(id)
      ? {
          last: id === latestIds.at(-1),
          undoAll:
            latestIds.length > 1
              ? { count: latestIds.length, onUndoAll: () => void undoInTurn(latestIds.toReversed()) }
              : undefined,
        }
      : undefined;
  // A card mid-decision stays mounted when the refresh finds it gone: its own decision made it so,
  // and only the mounted card knows how to undo it.
  const renderEntry = (entry: InboxQueueEntry, queued: boolean) =>
    entry.gone && !cards.decidedIds.has(entry.id) && !cards.engagedIds.has(entry.id) ? (
      <GoneProposalRow
        key={entry.id}
        entry={entry}
        onContinue={() => {
          queue.remove(entry.id);
          cards.setDraft(entry.id, undefined);
        }}
      />
    ) : (
      <InboxCardSlot
        key={entry.id}
        entry={entry}
        kind={kind}
        selected={entry.id === selection.effectiveId}
        queued={queued}
        draft={cards.drafts.get(entry.id)}
        known={known}
        pane={pane}
        cardHandles={cardHandles}
        onSelect={() => selection.select(entry.id)}
        onDraftChange={(draft) => cards.setDraft(entry.id, draft)}
        onEngagedChange={cards.setEngaged}
        decided={cards.decidedIds.has(entry.id)}
        latestDecided={latestOf(entry.id)}
        onDecided={(batch) => cards.markDecided(entry.id, true, batch)}
        onUndone={() => cards.markDecided(entry.id, false)}
        reveal={entry.id === selection.linkedCard}
      />
    );

  return (
    <Stack gap="lg">
      <ReviewPageHeader title="Inbox" actions={<InboxHeaderActions />} />
      <Stack gap="md">
        <InboxKindTabs {...kindsProps} />
        {queue.incomingCount > 0 && (
          <Button
            variant="light"
            size="xs"
            leftSection={<ArrowDown size={13} />}
            onClick={queue.showIncoming}
            {...stylex.props(styles.alignCenter)}
          >
            {queue.incomingCount === 1 ? "1 new proposal" : `${queue.incomingCount} new proposals`}
          </Button>
        )}
        {queue.entries.length === 0 ? (
          <InboxEmptyKind {...kindsProps} />
        ) : (
          <Group align="flex-start" wrap="nowrap" gap="lg">
            <Stack gap="xs" {...stylex.props(styles.queue)}>
              {queue.buckets.map((bucket) => (
                <InboxGroupSection
                  key={bucket.key}
                  group={bucket.group}
                  entries={bucket.entries}
                  kind={kind}
                  owner={catalog?.owner}
                  drafts={cards.drafts}
                  engagedIds={cards.engagedIds}
                  known={known}
                  renderEntry={renderEntry}
                  acceptOne={acceptOne}
                />
              ))}
            </Stack>
            {/* The selected card renders its detail in here (see InboxProposalCard). */}
            <Box ref={setPane} {...stylex.props(styles.pane)}>
              {selection.effectiveId === undefined && (
                <Text c="dimmed" size="sm" ta="center" py="xl">
                  Everything here is decided. Undo any of them on the left.
                </Text>
              )}
            </Box>
          </Group>
        )}
      </Stack>
    </Stack>
  );
}

/**
 * Binds a card's callbacks to its id once, so its effects don't re-run on every poll, and keeps the
 * selected row in view: j/k and the advance after a decision both move the selection off screen.
 */
function InboxCardSlot({
  entry,
  reveal,
  onEngagedChange,
  ...props
}: Omit<React.ComponentProps<typeof InboxProposalCard>, "card" | "onEngagedChange" | "ref"> & {
  entry: InboxQueueEntry;
  /** The card a link named (`?card=`): centred once, when it first renders. */
  reveal: boolean;
  onEngagedChange: (id: string, engaged: boolean) => void;
}) {
  const { id } = entry;
  const reportEngaged = useCallback((engaged: boolean) => onEngagedChange(id, engaged), [id, onEngagedChange]);
  const element = useRef<HTMLButtonElement | null>(null);
  const { selected } = props;
  // `nearest` leaves a row already in view alone; the row's scroll margin clears the sticky headers.
  useEffect(() => {
    if (selected) element.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  useEffect(() => {
    if (reveal) element.current?.scrollIntoView({ block: "center" });
  }, [reveal]);
  return <InboxProposalCard {...props} card={entry.card} onEngagedChange={reportEngaged} ref={element} />;
}
