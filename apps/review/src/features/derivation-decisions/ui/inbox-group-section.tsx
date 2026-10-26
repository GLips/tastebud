/**
 * One scope-and-subject group of the inbox: its header, batch accept for the cards that need no
 * review, and the cards themselves. A batch locks the cards it queued until each one is written, so
 * nothing it counted as unchanged can be edited under it.
 */
import { Alert, Button, Group, Paper, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InboxGroup } from "@taste/core/inbox";
import type { DerivedKindView } from "@taste/core/kind-catalog";
import { CheckCheck } from "lucide-react";
import { type ReactNode, useState, useSyncExternalStore } from "react";

import { recordDetailQuery } from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { STORE_WRITE_STALES } from "#review/shared/query-keys.ts";
import { refreshReviewQueriesAfterWrite } from "#review/shared/refresh-after-write.ts";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { ButtonLink } from "#review/shared/ui/router-links.tsx";

import type { InboxQueueEntry } from "./inbox-queue.ts";
import { isSameScope, type ScopeDraft } from "./scope-draft.ts";
import { sendReviewDecision } from "./use-review-decision.ts";

const styles = stylex.create({
  shrinkable: { minWidth: 0 },
  groupHeader: {
    position: "sticky",
    top: "48px",
    zIndex: 5,
    paddingBlock: "6px",
    backgroundColor: "var(--mantine-color-gray-0)",
  },
  gone: { borderStyle: "dashed", backgroundColor: "var(--mantine-color-gray-0)" },
});

/** Groups about the owner need no label; only derivations about someone else say whom. */
const subjectLabel = (subject: string | undefined, owner: string | undefined) =>
  subject === undefined || subject === "owner" || subject === owner ? undefined : `About ${subject}`;

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

function useBatchAccept(onAccepted: (id: string) => void, groupIds: ReadonlyArray<string>) {
  const queryClient = useQueryClient();
  const allQueued = useSyncExternalStore(subscribeToBatchQueue, readBatchQueuedIds, readBatchQueuedIds);
  const queued = new Set(groupIds.filter((id) => allQueued.has(id)));
  const [failures, setFailures] = useState<ReadonlyArray<{ id: string; sentence: string }>>([]);
  const acceptAll = async (ids: ReadonlyArray<string>) => {
    updateBatchQueuedIds((previous) => new Set([...previous, ...ids]));
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
      updateBatchQueuedIds((previous) => new Set([...previous].filter((kept) => kept !== id)));
      await acceptInOrder(rest);
    };
    await acceptInOrder(ids);
    setFailures(failed);
    void refreshReviewQueriesAfterWrite(queryClient, STORE_WRITE_STALES);
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
  onAccepted,
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
  onAccepted: (id: string) => void;
}) {
  const batch = useBatchAccept(
    onAccepted,
    entries.map((entry) => entry.id),
  );
  const live = entries.filter((entry) => !entry.gone).length;
  const ready = entries.filter((entry) => isBatchAcceptable(entry, drafts, engagedIds));
  const needReview = live - ready.length;
  const about = subjectLabel(group.subject, owner);
  return (
    <Stack gap="sm">
      <Group justify="space-between" {...stylex.props(styles.groupHeader)}>
        <Group gap="xs">
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
        {(ready.length > 1 || batch.pending) && (
          <Group gap="xxs">
            <Tooltip
              label="Edited, open and overlapping cards are left for you to review one by one"
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
            {needReview > 0 && !batch.pending && (
              <Text size="xs" c="dimmed">
                · {needReview} need review
              </Text>
            )}
          </Group>
        )}
      </Group>
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
