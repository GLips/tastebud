import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Group,
  Kbd,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { ArrowDown, CheckCheck, Keyboard, PartyPopper } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { InboxGroup } from "../core/index.ts";
import type { DerivedKindView } from "../shared/catalog-view.ts";
import { InboxProposalCard } from "../ui/inbox-card.tsx";
import { groupQueueEntries, type InboxQueueEntry, useStableInboxQueue } from "../ui/inbox-queue.ts";
import { capitalize, describeKindDelivery, KindGlyph } from "../ui/kind-identity.tsx";
import { ScopeChips } from "../ui/place-chips.tsx";
import { inboxGroupsQuery, recordDetailQuery, reviewShellQuery } from "../ui/review-queries.ts";
import { ReviewSessionList } from "../ui/review-session-list.tsx";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { AnchorLink, ButtonLink } from "../ui/router-links.tsx";
import { isSameScope, type ScopeDraft } from "../ui/scope-draft.ts";
import { type KnownPlaces, useKnownPlaces } from "../ui/use-review-context.ts";
import { sendReviewDecision } from "../ui/use-review-decision.ts";

const InboxSearch = Schema.Struct({ kind: Schema.optionalKey(Schema.String) });

export const Route = createFileRoute("/")({
  validateSearch: Schema.toStandardSchemaV1(InboxSearch),
  component: InboxScreen,
});

const LAST_KIND_KEY = "taste.inbox.kind";

const styles = stylex.create({
  screen: { maxWidth: "820px", marginInline: "auto" },
  groupHeader: {
    position: "sticky",
    top: "48px",
    zIndex: 5,
    paddingBlock: "6px",
    backgroundColor: "var(--mantine-color-gray-0)",
  },
  keys: { display: "grid", gridTemplateColumns: "auto auto", columnGap: "10px", rowGap: "4px", alignItems: "center" },
  tabLabel: { display: "inline-flex", alignItems: "center", gap: "6px" },
  tabCount: { fontVariantNumeric: "tabular-nums", color: "var(--mantine-color-gray-6)", fontWeight: 500 },
  gone: { borderStyle: "dashed", backgroundColor: "var(--mantine-color-gray-0)" },
});

const INBOX_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["j / k", "Next / previous"],
  ["a", "Accept, or review first if needed"],
  ["s", "Edit where it applies"],
  ["r", "Reject with a reason"],
  ["d", "Discuss with an agent"],
  ["⌘↵ / Esc", "Confirm / back, in a preview"],
];

/** Groups about the owner need no label; only derivations about someone else say whom. */
const subjectLabel = (subject: string | undefined, owner: string | undefined) =>
  subject === undefined || subject === "owner" || subject === owner ? undefined : `About ${subject}`;

const isUnchangedAndClear = (entry: InboxQueueEntry, drafts: ReadonlyMap<string, ScopeDraft>) => {
  const draft = drafts.get(entry.id);
  const edited = draft !== undefined && !isSameScope(entry.card.derivation.proposedScope, draft);
  return !entry.gone && !edited && entry.card.needsAcknowledgement.length === 0;
};

/** A card someone decided in another tab or process: kept in place so the queue doesn't jump. */
function GoneProposalRow({ entry, onContinue }: { entry: InboxQueueEntry; onContinue: () => void }) {
  const detail = useQuery(recordDetailQuery(entry.id));
  const status = detail.data?.derivation?.status;
  return (
    <Paper px="md" py="sm" {...stylex.props(styles.gone)}>
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text size="sm" c="dimmed" td="line-through" truncate>
            {entry.card.derivation.statement}
          </Text>
          <Text size="xs" c="dimmed">
            {status === undefined || status === "pending" ? "No longer pending" : `Already ${status} elsewhere`}
          </Text>
        </Stack>
        <Group gap={6} wrap="nowrap">
          <ButtonLink to="/derivations/$id" params={{ id: entry.id }} variant="subtle" color="gray" size="xs">
            View decision
          </ButtonLink>
          <Button size="xs" variant="default" onClick={onContinue}>
            Continue
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}

function useBatchAccept(onAccepted: (id: string) => void) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [failures, setFailures] = useState<ReadonlyArray<{ id: string; sentence: string }>>([]);
  const acceptAll = async (ids: ReadonlyArray<string>) => {
    setPending(true);
    setFailures([]);
    const failed: Array<{ id: string; sentence: string }> = [];
    // One at a time, in the order shown: a later card may be refused because an earlier one landed.
    const acceptInOrder = async (remaining: ReadonlyArray<string>): Promise<void> => {
      const [id, ...rest] = remaining;
      if (id === undefined) return;
      const outcome = await sendReviewDecision(id, { outcome: "accept" }).catch((error: Error) => ({
        ok: false as const,
        failure: { sentence: error.message, category: "broken" as const, tag: "Network" },
      }));
      if (outcome.ok) onAccepted(id);
      else failed.push({ id, sentence: outcome.failure.sentence });
      await acceptInOrder(rest);
    };
    await acceptInOrder(ids);
    setFailures(failed);
    setPending(false);
    void queryClient.invalidateQueries();
  };
  return { acceptAll, pending, failures };
}

function InboxGroupSection({
  group,
  entries,
  kind,
  owner,
  drafts,
  known,
  renderEntry,
  onAccepted,
}: {
  group: InboxGroup;
  entries: ReadonlyArray<InboxQueueEntry>;
  kind: DerivedKindView;
  owner: string | undefined;
  drafts: ReadonlyMap<string, ScopeDraft>;
  known: KnownPlaces;
  renderEntry: (entry: InboxQueueEntry) => React.ReactNode;
  onAccepted: (id: string) => void;
}) {
  const batch = useBatchAccept(onAccepted);
  const ready = entries.filter((entry) => isUnchangedAndClear(entry, drafts));
  const needReview = entries.filter((entry) => !entry.gone).length - ready.length;
  const about = subjectLabel(group.subject, owner);
  const live = entries.filter((entry) => !entry.gone).length;
  return (
    <Stack gap="sm">
      <Group justify="space-between" {...stylex.props(styles.groupHeader)}>
        <Group gap={8}>
          {about !== undefined && (
            <Text size="sm" fw={600}>
              {about}
            </Text>
          )}
          <ScopeChips scope={group.scope} labels={known.labels} />
          <Tooltip label={`${live} waiting in this scope`} withArrow>
            <Text size="xs" c="dimmed">
              {live}
            </Text>
          </Tooltip>
        </Group>
        {ready.length > 1 && (
          <Group gap={6}>
            <Tooltip
              label="Edited cards and cards that overlap a near repeat are left for you to review one by one"
              withArrow
              multiline
              w={260}
              disabled={needReview === 0}
            >
              <Button
                variant="subtle"
                leftSection={<CheckCheck size={14} />}
                loading={batch.pending}
                onClick={() => void batch.acceptAll(ready.map((entry) => entry.id))}
              >
                {kind.acceptLabel} {ready.length} unchanged proposals
              </Button>
            </Tooltip>
            {needReview > 0 && (
              <Text size="xs" c="dimmed">
                · {needReview} need review
              </Text>
            )}
          </Group>
        )}
      </Group>
      {batch.failures.length > 0 && (
        <Alert color="red" variant="light" title="Some weren't accepted">
          <Stack gap={4}>
            {batch.failures.map((failure) => (
              <Text key={failure.id} size="sm">
                {failure.sentence}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}
      {entries.map(renderEntry)}
    </Stack>
  );
}

function KindTabLabel({ kind, count }: { kind: DerivedKindView; count: number }) {
  const catalog = useQuery(reviewShellQuery).data?.catalog;
  return (
    <span {...stylex.props(styles.tabLabel)}>
      <KindGlyph catalog={catalog} kind={kind.key} />
      {capitalize(kind.plural)}
      <span {...stylex.props(styles.tabCount)}>{count}</span>
    </span>
  );
}

const readLastKind = (): string | undefined =>
  typeof localStorage === "undefined" ? undefined : (localStorage.getItem(LAST_KIND_KEY) ?? undefined);

function InboxScreen() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const shell = useQuery(reviewShellQuery);
  const inbox = useQuery(inboxGroupsQuery);
  const known = useKnownPlaces();
  const catalog = shell.data?.catalog;
  const kinds = catalog?.derivedKinds ?? [];
  const requested = search.kind ?? readLastKind();
  const kind = kinds.find((candidate) => candidate.key === requested) ?? kinds[0];
  const kindKey = kind?.key ?? "";
  const queue = useStableInboxQueue(inbox.data?.groups, kindKey);
  const [drafts, setDrafts] = useState<ReadonlyMap<string, ScopeDraft>>(() => new Map());
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [engagedId, setEngagedId] = useState<string | undefined>(undefined);
  const cardRefs = useRef(new Map<string, HTMLDivElement>()).current;

  useEffect(() => {
    if (kind !== undefined) localStorage.setItem(LAST_KIND_KEY, kind.key);
  }, [kind]);

  const pendingByKind = new Map<string, number>();
  for (const group of inbox.data?.groups ?? [])
    pendingByKind.set(group.kind, (pendingByKind.get(group.kind) ?? 0) + group.cards.length);

  const order = queue.entries.map((entry) => entry.id);
  // A decided card leaves the queue; selection falls to whatever now sits at the same position.
  const [lastIndex, setLastIndex] = useState(0);
  const selectedIndex = selectedId === undefined ? -1 : order.indexOf(selectedId);
  if (selectedIndex >= 0 && selectedIndex !== lastIndex) setLastIndex(selectedIndex);
  const effectiveId = selectedIndex >= 0 ? selectedId : order[Math.min(lastIndex, order.length - 1)];
  const engaged = engagedId !== undefined && engagedId === effectiveId;

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
      setEngagedId((previous) => (isEngaged ? id : previous === id ? undefined : previous)),
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
    if (engagedId === id) setEngagedId(undefined);
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
  const renderEntry = (entry: InboxQueueEntry) =>
    entry.gone ? (
      <GoneProposalRow key={entry.id} entry={entry} onContinue={() => removeFromQueue(entry.id)} />
    ) : (
      <InboxCardSlot
        key={entry.id}
        entry={entry}
        kind={kind}
        selected={entry.id === effectiveId}
        draft={drafts.get(entry.id)}
        known={known}
        onSelect={() => select(entry.id, false)}
        onDraftChange={(draft) => setDraft(entry.id, draft)}
        onEngagedChange={onEngagedChange}
        onDecided={() => removeFromQueue(entry.id)}
        cardRefs={cardRefs}
      />
    );

  return (
    <Stack gap="md" {...stylex.props(styles.screen)}>
      <Group justify="space-between" align="center">
        <Tooltip
          label="What agents proposed from what people said. Nothing counts until you accept it."
          withArrow
          multiline
          w={260}
          position="bottom-start"
        >
          <Title order={3}>Inbox</Title>
        </Tooltip>
        <Tooltip
          withArrow
          position="bottom-end"
          label={
            <div {...stylex.props(styles.keys)}>
              {INBOX_KEYS.map(([keys, action]) => [
                <Kbd key={`${keys}-k`} size="xs">
                  {keys}
                </Kbd>,
                <span key={`${keys}-a`}>{action}</span>,
              ])}
            </div>
          }
        >
          <ActionIcon variant="subtle" color="gray" aria-label="Keyboard shortcuts">
            <Keyboard size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {kinds.length > 1 && (
        <Stack gap={6}>
          <SegmentedControl
            size="sm"
            value={kind.key}
            onChange={(value) => void navigate({ search: { kind: value }, replace: true })}
            data={kinds.map((candidate) => ({
              value: candidate.key,
              label: <KindTabLabel kind={candidate} count={pendingByKind.get(candidate.key) ?? 0} />,
            }))}
            style={{ alignSelf: "flex-start" }}
          />
        </Stack>
      )}
      <Text size="xs" c="dimmed" mt={kinds.length > 1 ? -8 : 0}>
        {describeKindDelivery(kind)}
      </Text>

      {queue.incomingCount > 0 && (
        <Button
          variant="light"
          size="xs"
          leftSection={<ArrowDown size={13} />}
          onClick={queue.showIncoming}
          style={{ alignSelf: "center" }}
        >
          {queue.incomingCount === 1 ? "1 new proposal" : `${queue.incomingCount} new proposals`}
        </Button>
      )}

      {queue.entries.length === 0 ? (
        <Center py={64}>
          <Stack align="center" gap={6}>
            <PartyPopper size={28} color="var(--mantine-color-taste-6)" />
            <Text fw={600}>No {kind.plural} waiting</Text>
            {othersWaiting.length > 0 ? (
              <Group gap={6} mt={4}>
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
                Agents propose with <code>taste propose</code>.{" "}
                <AnchorLink to="/kinds/$kind" params={{ kind: kind.key }}>
                  Browse {kind.plural}
                </AnchorLink>
              </Text>
            )}
          </Stack>
        </Center>
      ) : (
        groupQueueEntries(queue.entries).map((bucket) => (
          <InboxGroupSection
            key={bucket.key}
            group={bucket.group}
            entries={bucket.entries}
            kind={kind}
            owner={catalog?.owner}
            drafts={drafts}
            known={known}
            renderEntry={renderEntry}
            onAccepted={removeFromQueue}
          />
        ))
      )}

      <ReviewSessionList />
    </Stack>
  );
}

/** Binds a card's callbacks to its id once, so its effects don't re-run on every poll. */
function InboxCardSlot({
  entry,
  cardRefs,
  onEngagedChange,
  ...props
}: Omit<React.ComponentProps<typeof InboxProposalCard>, "card" | "onEngagedChange" | "ref"> & {
  entry: InboxQueueEntry;
  cardRefs: Map<string, HTMLDivElement>;
  onEngagedChange: (id: string, engaged: boolean) => void;
}) {
  const { id } = entry;
  const reportEngaged = useCallback((engaged: boolean) => onEngagedChange(id, engaged), [id, onEngagedChange]);
  return (
    <InboxProposalCard
      {...props}
      card={entry.card}
      onEngagedChange={reportEngaged}
      ref={(element) => {
        if (element) cardRefs.set(id, element);
        else cardRefs.delete(id);
      }}
    />
  );
}
