/**
 * One scope-and-subject group of the inbox queue: its header, batch accept for the cards that need no
 * review, and the rows themselves. A batch locks the cards it queued until each one is written, so
 * nothing it counted as unchanged can be edited under it.
 */
import { Alert, Button, Group, Paper, Stack, Text, Title, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import type { InboxGroup } from "@tastebud/core/inbox";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { type DerivationScope, isSameScope, type ScopeDraft } from "@tastebud/core/places";
import { CheckCheck, Globe } from "lucide-react";
import { type ReactNode, useState, useSyncExternalStore } from "react";

import { recordDetailQuery } from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { PlaceFormIcon } from "#review/shared/ui/place-chips.tsx";
import { ButtonLink } from "#review/shared/ui/router-links.tsx";
import { SubjectLabel } from "#review/shared/ui/subject-label.tsx";

import type { InboxQueueEntry } from "./inbox-queue.ts";
import type { InboxBatch } from "./use-inbox-card-triage.ts";

const styles = stylex.create({
  shrinkable: { minWidth: 0 },
  titleSide: { minWidth: 0, flex: 1 },
  noShrink: { flexShrink: 0 },
  groupHeader: {
    position: "sticky",
    top: "var(--review-shell-header-height)",
    zIndex: 5,
    paddingTop: "12px",
    paddingBottom: "6px",
    backgroundColor: "var(--mantine-color-gray-0)",
  },
  gone: { borderStyle: "dashed", backgroundColor: "var(--mantine-color-gray-0)" },
});

/** The group's scope as a section title: the place names themselves, not chips. */
function ScopeTitle({ scope, known }: { scope: DerivationScope; known: KnownPlaces }) {
  if (scope.scope === "global") {
    return (
      <Group gap="xxs" wrap="nowrap">
        <Globe size={16} aria-hidden />
        <Title order={4}>Everywhere</Title>
      </Group>
    );
  }
  return (
    <Group gap="xs" wrap="wrap">
      {scope.places.map((place, index) => (
        <Group key={place} gap="xxs" wrap="nowrap">
          {index > 0 && (
            <Text c="dimmed" fw={600}>
              +
            </Text>
          )}
          <PlaceFormIcon place={place} size={16} />
          <Title order={4}>{known.labelOf(place)}</Title>
        </Group>
      ))}
    </Group>
  );
}

/** A card is batchable when the reviewer hasn't touched it: no edit, nothing to acknowledge, not open. */
const isBatchAcceptable = (
  entry: InboxQueueEntry,
  drafts: ReadonlyMap<string, ScopeDraft>,
  engagedIds: ReadonlySet<string>,
) => {
  const draft = drafts.get(entry.id);
  const edited = draft !== undefined && !isSameScope(entry.card.derivation.proposedScope, draft);
  return !entry.gone && !edited && !engagedIds.has(entry.id) && entry.card.needsAcknowledgement.length === 0;
};

/** A card someone decided in another tab or process: kept in place so the queue doesn't jump. */
export function GoneProposalRow({ entry, onContinue }: { entry: InboxQueueEntry; onContinue: () => void }) {
  const detail = useQuery(recordDetailQuery(entry.id));
  const status = detail.data?.derivation?.status;
  return (
    <Paper px="md" py="sm" {...stylex.props(styles.gone)}>
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Stack gap="3xs" {...stylex.props(styles.shrinkable)}>
          <Text size="sm" c="dimmed" td="line-through" truncate>
            {entry.card.derivation.statement}
          </Text>
          <Text size="xs" c="dimmed">
            {status === undefined || status === "pending" ? "No longer pending" : `Already ${status} elsewhere`}
          </Text>
        </Stack>
        <Group gap="xxs" wrap="nowrap">
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

/**
 * Ids queued by a running batch. They live outside React because the batch's loop outlives the group
 * that started it: switch kinds mid-batch and come back, and the cards must still be locked.
 */
let batchQueuedIds: ReadonlySet<string> = new Set();
const batchQueueListeners = new Set<() => void>();
const updateBatchQueuedIds = (next: (previous: ReadonlySet<string>) => ReadonlySet<string>) => {
  batchQueuedIds = next(batchQueuedIds);
  for (const listener of batchQueueListeners) listener();
};
const subscribeToBatchQueue = (listener: () => void) => {
  batchQueueListeners.add(listener);
  return () => batchQueueListeners.delete(listener);
};
const readBatchQueuedIds = () => batchQueuedIds;

/**
 * Accepts each card through the card itself, so every one folds to its outcome with its own Undo just
 * as a single decision does. `acceptOne` resolves to the refusal sentence, or undefined once it landed.
 */
function useBatchAccept(
  acceptOne: (id: string, batch: InboxBatch) => Promise<string | undefined>,
  groupIds: ReadonlyArray<string>,
) {
  const allQueued = useSyncExternalStore(subscribeToBatchQueue, readBatchQueuedIds, readBatchQueuedIds);
  const queued = new Set(groupIds.filter((id) => allQueued.has(id)));
  const [failures, setFailures] = useState<ReadonlyArray<{ id: string; sentence: string }>>([]);
  const acceptAll = async (ids: InboxBatch) => {
    updateBatchQueuedIds((previous) => new Set([...previous, ...ids]));
    setFailures([]);
    const failed: Array<{ id: string; sentence: string }> = [];
    // One at a time, in the order shown: a later card may be refused because an earlier one landed.
    const acceptInOrder = async (remaining: ReadonlyArray<string>): Promise<void> => {
      const [id, ...rest] = remaining;
      if (id === undefined) return;
      // Unqueued as its turn comes, so the card shows its own decision pending rather than "Queued".
      updateBatchQueuedIds((previous) => new Set([...previous].filter((kept) => kept !== id)));
      const refusal = await acceptOne(id, ids);
      if (refusal !== undefined) failed.push({ id, sentence: refusal });
      await acceptInOrder(rest);
    };
    await acceptInOrder(ids);
    setFailures(failed);
  };
  return { acceptAll, queued, pending: queued.size > 0, failures };
}

export function InboxGroupSection({
  group,
  entries,
  kind,
  owner,
  drafts,
  engagedIds,
  known,
  renderEntry,
  acceptOne,
}: {
  group: InboxGroup;
  entries: ReadonlyArray<InboxQueueEntry>;
  kind: DerivedKindView;
  owner: string | undefined;
  drafts: ReadonlyMap<string, ScopeDraft>;
  /** Cards open for editing, rejecting or previewing: the reviewer is mid-decision, so batch skips them. */
  engagedIds: ReadonlySet<string>;
  known: KnownPlaces;
  renderEntry: (entry: InboxQueueEntry, queued: boolean) => ReactNode;
  acceptOne: (id: string, batch: InboxBatch) => Promise<string | undefined>;
}) {
  const batch = useBatchAccept(
    acceptOne,
    entries.map((entry) => entry.id),
  );
  const live = entries.filter((entry) => !entry.gone).length;
  const ready = entries.filter((entry) => isBatchAcceptable(entry, drafts, engagedIds));
  const needReview = live - ready.length;
  // Every card in a group shares its subject, so the first speaks for the group.
  const [first] = group.cards;
  return (
    <Stack gap="2xs" component="section">
      <Stack gap="2xs" {...stylex.props(styles.groupHeader)}>
        {/* Never wraps, so batch Believe sits at the right of the title row in every group. */}
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="sm" {...stylex.props(styles.titleSide)}>
            <ScopeTitle scope={group.scope} known={known} />
            <Text size="sm" c="dimmed">
              {live} waiting {first !== undefined && <SubjectLabel summary={first.derivation} owner={owner} />}
            </Text>
          </Group>
          {(ready.length > 1 || batch.pending) && (
            <Tooltip
              label={
                needReview > 0 && !batch.pending
                  ? `${needReview} edited, open or overlapping are left for you to decide one by one`
                  : "Each one can be undone after"
              }
              withArrow
            >
              <Button
                size="xs"
                variant="default"
                leftSection={<CheckCheck size={14} />}
                {...stylex.props(styles.noShrink)}
                loading={batch.pending}
                onClick={() => void batch.acceptAll(ready.map((entry) => entry.id))}
              >
                {`${kind.acceptLabel} ${ready.length === 2 ? "both" : `all ${ready.length}`} as proposed`}
              </Button>
            </Tooltip>
          )}
        </Group>
      </Stack>
      {batch.failures.length > 0 && (
        <Alert color="red" variant="light" title="Some weren't accepted">
          <Stack gap="2xs">
            {batch.failures.map((failure) => (
              <Text key={failure.id} size="sm">
                {failure.sentence}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}
      {entries.map((entry) => renderEntry(entry, batch.queued.has(entry.id)))}
    </Stack>
  );
}
