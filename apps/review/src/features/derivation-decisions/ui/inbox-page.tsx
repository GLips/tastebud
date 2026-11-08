import { Box, Button, Center, Group, Loader, SegmentedControl, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { type ScopeDraft } from "@tastebud/core/places";
import { Schema } from "effect";
import { ArrowDown, PartyPopper } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { reviewShellQuery, useKnownPlaces } from "#review/features/review-shell/index.ts";
import { readRememberedBrowserText, rememberBrowserText } from "#review/infrastructure/browser-storage.ts";
import { capitalize, KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

import { inboxGroupsQuery } from "./decision-queries.ts";
import { InboxProposalCard } from "./inbox-card.tsx";
import { GoneProposalRow, InboxGroupSection } from "./inbox-group-section.tsx";
import { type InboxQueueEntry, useStableInboxQueue } from "./inbox-queue.ts";
import { InboxHeaderActions, InboxRail } from "./inbox-rail.tsx";

/** `card` selects one proposal on arrival, for links that name a specific pending item. */
export const InboxSearch = Schema.Struct({
  kind: Schema.optionalKey(Schema.String),
  card: Schema.optionalKey(Schema.String),
});

const Route = getRouteApi("/");

const LAST_KIND_KEY = "tastebud.inbox.kind";

/** The card selected when the inbox last unmounted, so a trip to a card's page and back keeps the reviewer's place. */
let leftSelectedCard: string | undefined;

const styles = stylex.create({
  alignStart: { alignSelf: "flex-start" },
  alignCenter: { alignSelf: "center" },
  // A readable measure with or without the rail, so the queue doesn't jump when the rail appears.
  queue: { flex: 1, minWidth: 0, maxWidth: "760px" },
  tabLabel: { display: "inline-flex", alignItems: "center", gap: "6px" },
  tabCount: { fontVariantNumeric: "tabular-nums", color: "var(--mantine-color-gray-6)", fontWeight: 500 },
});

/** What accepting does for the selected kind, finishing the page's one-line job. */
const describeAcceptedOutcome = (kind: Pick<DerivedKindView, "plural" | "recall">): string => {
  const outcomes: Record<DerivedKindView["recall"], string> = {
    inject: `Accepted ${kind.plural} are told to agents wherever they apply.`,
    pull: `Agents can look up accepted ${kind.plural} wherever they apply.`,
    never: `Accepted ${kind.plural} go to your backlog; agents aren't told them.`,
  };
  return outcomes[kind.recall];
};

/**
 * The tab a bare `/` opens: the last one used if anything waits there, otherwise the busiest. Chosen
 * once per visit, so deciding the last item in a tab shows its empty state rather than switching tabs.
 */
const arrivalKindOf = (
  kinds: ReadonlyArray<DerivedKindView>,
  pendingByKind: ReadonlyMap<string, number>,
  remembered: string | undefined,
): string | undefined => {
  if (remembered !== undefined && (pendingByKind.get(remembered) ?? 0) > 0) return remembered;
  const busiest = kinds.toSorted((a, b) => (pendingByKind.get(b.key) ?? 0) - (pendingByKind.get(a.key) ?? 0))[0];
  return (pendingByKind.get(busiest?.key ?? "") ?? 0) > 0 ? busiest?.key : remembered;
};

function KindTabLabel({ kind, count }: { kind: DerivedKindView; count: number }) {
  const catalog = useQuery(reviewShellQuery).data?.catalog;
  return (
    <Box component="span" {...stylex.props(styles.tabLabel)}>
      <KindGlyph catalog={catalog} kind={kind.key} />
      {capitalize(kind.plural)}
      <Box component="span" {...stylex.props(styles.tabCount)}>
        {count}
      </Box>
    </Box>
  );
}

export function InboxPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const shell = useQuery(reviewShellQuery);
  const inbox = useQuery(inboxGroupsQuery);
  const known = useKnownPlaces();
  const catalog = shell.data?.catalog;
  const kinds = catalog?.derivedKinds ?? [];
  const pendingByKind = new Map<string, number>();
  for (const group of inbox.data?.groups ?? [])
    pendingByKind.set(group.kind, (pendingByKind.get(group.kind) ?? 0) + group.cards.length);
  const [arrivalKind, setArrivalKind] = useState<string | undefined>(undefined);
  if (arrivalKind === undefined && inbox.data !== undefined && kinds.length > 0)
    setArrivalKind(arrivalKindOf(kinds, pendingByKind, readRememberedBrowserText(LAST_KIND_KEY)) ?? kinds[0]?.key);
  const requested = search.kind ?? arrivalKind;
  const kind = kinds.find((candidate) => candidate.key === requested) ?? kinds[0];
  const kindKey = kind?.key ?? "";
  const queue = useStableInboxQueue(inbox.data?.groups, kindKey);
  const [drafts, setDrafts] = useState<ReadonlyMap<string, ScopeDraft>>(() => new Map());
  const [selectedId, setSelectedId] = useState<string | undefined>(search.card ?? leftSelectedCard);
  const [linkedCard, setLinkedCard] = useState(search.card);
  if (search.card !== linkedCard) {
    setLinkedCard(search.card);
    setSelectedId(search.card);
  }
  const [engagedIds, setEngagedIds] = useState<ReadonlySet<string>>(() => new Set());
  const cardRefs = useRef(new Map<string, HTMLDivElement>()).current;

  // Only a tab actually chosen is remembered, not the placeholder shown before the arrival tab is.
  const chosenKind = requested === undefined ? undefined : kind?.key;
  useEffect(() => {
    if (chosenKind !== undefined) rememberBrowserText(LAST_KIND_KEY, chosenKind);
  }, [chosenKind]);

  // Cards decided here stay where they were, folded to their outcome with Undo, but j/k skip them.
  const [decidedHere, setDecidedHere] = useState<ReadonlySet<string>>(() => new Set());
  const order = queue.entries.filter((entry) => !decidedHere.has(entry.id)).map((entry) => entry.id);
  // A decided card leaves the order; selection falls to whatever now sits at the same position.
  const [lastIndex, setLastIndex] = useState(0);
  const selectedIndex = selectedId === undefined ? -1 : order.indexOf(selectedId);
  if (selectedIndex >= 0 && selectedIndex !== lastIndex) setLastIndex(selectedIndex);
  const effectiveId = selectedIndex >= 0 ? selectedId : order[Math.min(lastIndex, order.length - 1)];
  const engaged = effectiveId !== undefined && engagedIds.has(effectiveId);
  useEffect(() => {
    leftSelectedCard = effectiveId;
  }, [effectiveId]);

  const select = (id: string | undefined, scroll: boolean) => {
    setSelectedId(id);
    if (scroll && id !== undefined) cardRefs.get(id)?.scrollIntoView({ block: "nearest" });
  };
  const move = (by: 1 | -1) => () => {
    if (order.length === 0 || engaged) return;
    const at = effectiveId === undefined ? -1 : order.indexOf(effectiveId);
    select(order[Math.max(0, Math.min(order.length - 1, at + by))], true);
  };
  useHotkeys([
    { hotkey: "J", callback: move(1), options: { enabled: !engaged } },
    { hotkey: "K", callback: move(-1), options: { enabled: !engaged } },
  ]);

  const onEngagedChange = useCallback(
    (id: string, isEngaged: boolean) =>
      setEngagedIds((previous) => {
        if (previous.has(id) === isEngaged) return previous;
        const next = new Set(previous);
        if (isEngaged) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  const setDraft = (id: string, draft: ScopeDraft | undefined) =>
    setDrafts((previous) => {
      const next = new Map(previous);
      if (draft === undefined) next.delete(id);
      else next.set(id, draft);
      return next;
    });
  const removeFromQueue = (id: string) => {
    queue.remove(id);
    setDraft(id, undefined);
  };
  // The newest decision made here, which `u` undoes.
  const [latestDecidedId, setLatestDecidedId] = useState<string | undefined>(undefined);
  // The scope draft is kept through a decision, so an Undo brings back the scope the owner had chosen.
  const markDecided = (id: string, decided: boolean) => {
    setDecidedHere((previous) => {
      const next = new Set(previous);
      if (decided) next.add(id);
      else next.delete(id);
      return next;
    });
    setLatestDecidedId(decided ? id : undefined);
  };

  if (shell.error) return <QueryErrorAlert error={shell.error} />;
  if (inbox.error) return <QueryErrorAlert error={inbox.error} />;
  if (inbox.data === undefined || kind === undefined) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  const othersWaiting = kinds.filter((other) => other.key !== kind.key && (pendingByKind.get(other.key) ?? 0) > 0);
  // A card mid-decision stays mounted when the refresh finds it gone: its own decision made it so,
  // and only the mounted card knows how to undo it.
  const renderEntry = (entry: InboxQueueEntry, queued: boolean) =>
    entry.gone && !decidedHere.has(entry.id) && !engagedIds.has(entry.id) ? (
      <GoneProposalRow key={entry.id} entry={entry} onContinue={() => removeFromQueue(entry.id)} />
    ) : (
      <InboxCardSlot
        key={entry.id}
        entry={entry}
        kind={kind}
        selected={entry.id === effectiveId}
        queued={queued}
        draft={drafts.get(entry.id)}
        known={known}
        onSelect={() => select(entry.id, false)}
        onDraftChange={(draft) => setDraft(entry.id, draft)}
        onEngagedChange={onEngagedChange}
        decided={decidedHere.has(entry.id)}
        latestDecided={entry.id === latestDecidedId}
        onDecided={() => markDecided(entry.id, true)}
        onUndone={() => markDecided(entry.id, false)}
        cardRefs={cardRefs}
        reveal={entry.id === linkedCard}
      />
    );

  return (
    <Stack gap="lg">
      <ReviewPageHeader
        title="Inbox"
        purpose={`Proposals waiting on you. ${describeAcceptedOutcome(kind)}`}
        actions={<InboxHeaderActions />}
      />
      <Group align="flex-start" wrap="nowrap" gap="xl">
        <Stack gap="md" {...stylex.props(styles.queue)}>
          {kinds.length > 1 && (
            <SegmentedControl
              size="sm"
              value={kind.key}
              onChange={(value) => void navigate({ search: { kind: value }, replace: true })}
              data={kinds.map((candidate) => ({
                value: candidate.key,
                label: <KindTabLabel kind={candidate} count={pendingByKind.get(candidate.key) ?? 0} />,
              }))}
              {...stylex.props(styles.alignStart)}
            />
          )}

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
            <Center py={64}>
              <Stack align="center" gap="xxs">
                <PartyPopper size={28} color="var(--mantine-color-tastebud-6)" />
                <Text fw={600}>No {kind.plural} waiting</Text>
                {othersWaiting.length > 0 ? (
                  <Group gap="xxs" mt="2xs">
                    {othersWaiting.map((other) => (
                      <Button
                        key={other.key}
                        size="xs"
                        variant="default"
                        leftSection={<KindGlyph catalog={catalog} kind={other.key} />}
                        onClick={() => void navigate({ search: { kind: other.key }, replace: true })}
                      >
                        Review {pendingByKind.get(other.key)}{" "}
                        {pendingByKind.get(other.key) === 1 ? other.singular : other.plural}
                      </Button>
                    ))}
                  </Group>
                ) : (
                  <Text size="sm" c="dimmed">
                    Agents propose with <code>tastebud propose</code>.{" "}
                    <AnchorLink to="/kinds/$kind" params={{ kind: kind.key }}>
                      Browse {kind.plural}
                    </AnchorLink>
                  </Text>
                )}
              </Stack>
            </Center>
          ) : (
            queue.buckets.map((bucket) => (
              <InboxGroupSection
                key={bucket.key}
                group={bucket.group}
                entries={bucket.entries}
                kind={kind}
                owner={catalog?.owner}
                drafts={drafts}
                engagedIds={engagedIds}
                known={known}
                renderEntry={renderEntry}
                onAccepted={removeFromQueue}
              />
            ))
          )}
        </Stack>
        <InboxRail />
      </Group>
    </Stack>
  );
}

/** Binds a card's callbacks to its id once, so its effects don't re-run on every poll. */
function InboxCardSlot({
  entry,
  cardRefs,
  reveal,
  onEngagedChange,
  ...props
}: Omit<React.ComponentProps<typeof InboxProposalCard>, "card" | "onEngagedChange" | "ref"> & {
  entry: InboxQueueEntry;
  cardRefs: Map<string, HTMLDivElement>;
  /** The card a link named (`?card=`): scrolled to once, when it first renders. */
  reveal: boolean;
  onEngagedChange: (id: string, engaged: boolean) => void;
}) {
  const { id } = entry;
  const reportEngaged = useCallback((engaged: boolean) => onEngagedChange(id, engaged), [id, onEngagedChange]);
  const element = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (reveal) element.current?.scrollIntoView({ block: "center" });
  }, [reveal]);
  return (
    <InboxProposalCard
      {...props}
      card={entry.card}
      onEngagedChange={reportEngaged}
      ref={(mounted) => {
        element.current = mounted;
        if (mounted) cardRefs.set(id, mounted);
        else cardRefs.delete(id);
      }}
    />
  );
}
