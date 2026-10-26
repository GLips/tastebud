import { Box, ActionIcon, Alert, Badge, Group, Paper, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ThreadEntryRecord } from "@taste/core/records";
import type { ListenerHeartbeat } from "@taste/core/review-threads";
import { SendHorizontal } from "lucide-react";
import { useState } from "react";

import { describeAuthor, formatReviewTime, formatTimeAgo } from "#review/shared/format.ts";
import { THREAD_NOTE_STALES } from "#review/shared/query-keys.ts";
import { refreshReviewQueriesAfterWrite } from "#review/shared/refresh-after-write.ts";
import { unwrapReviewOutcome } from "#review/shared/review-outcome.ts";
import { ReviewTextarea } from "#review/shared/ui/textarea.tsx";

import { postOwnerThreadNote } from "../controllers/thread-note.ts";
import { useReviewClockMs } from "./use-review-clock.ts";

const styles = stylex.create({
  entry: { display: "flex", flexDirection: "column", gap: "4px" },
  owner: { backgroundColor: "var(--mantine-color-taste-0)", borderColor: "var(--mantine-color-taste-1)" },
  text: { whiteSpace: "pre-wrap" },
  dot: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" },
  dotLive: { backgroundColor: "var(--mantine-color-teal-5)" },
  dotIdle: { backgroundColor: "var(--mantine-color-gray-4)" },
});

/** Whether a note posted now would wake an agent: any listener with a fresh heartbeat. */
function AgentListeningIndicator({ listeners }: { listeners: ReadonlyArray<ListenerHeartbeat> }) {
  const nowMs = useReviewClockMs();
  const live = listeners.filter((listener) => listener.listening);
  if (live.length > 0) {
    return (
      <Tooltip label={`Heartbeat ${formatTimeAgo(live[0]?.heartbeatAt, nowMs)}`} withArrow>
        <Group gap="xs">
          <Paper
            component="span"
            withBorder={false}
            shadow="listeningDot"
            {...stylex.props(styles.dot, styles.dotLive)}
          />
          <Text size="xs" c="teal.8" fw={500}>
            {live.map((listener) => listener.name).join(", ")} listening
          </Text>
        </Group>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      label="Run `taste review listen --as <name>` in an agent session so notes wake it"
      withArrow
      multiline
      w={260}
    >
      <Group gap="xs">
        <Box component="span" {...stylex.props(styles.dot, styles.dotIdle)} />
        <Text size="xs" c="dimmed">
          No agent listening
        </Text>
      </Group>
    </Tooltip>
  );
}

/** One derivation's discussion, oldest first, with a composer that always writes as the store owner. */
export function DerivationThread({
  derivationId,
  thread,
  owner,
  listeners,
}: {
  derivationId: string;
  thread: ReadonlyArray<ThreadEntryRecord>;
  owner: string;
  listeners: ReadonlyArray<ListenerHeartbeat>;
}) {
  const nowMs = useReviewClockMs();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const post = useMutation({
    mutationFn: async (text: string) =>
      unwrapReviewOutcome(await postOwnerThreadNote({ data: { ref: derivationId, text } })),
    onSuccess: () => setDraft(""),
    onSettled: () => refreshReviewQueriesAfterWrite(queryClient, THREAD_NOTE_STALES),
  });
  const submit = () => {
    if (draft.trim() !== "" && !post.isPending) post.mutate(draft);
  };
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          Thread
        </Text>
        <AgentListeningIndicator listeners={listeners} />
      </Group>
      {thread.map((entry) => {
        const isOwner = entry.author === owner;
        return (
          <Paper key={entry.id} px="sm" py="xs" {...stylex.props(styles.entry, isOwner && styles.owner)}>
            <Group gap="xs">
              <Badge size="xs" variant={isOwner ? "filled" : "light"} color={isOwner ? "taste" : "gray"} tt="none">
                {describeAuthor(entry.author, owner)}
              </Badge>
              <Text size="xs" c="dimmed" title={formatReviewTime(entry.at)}>
                {formatTimeAgo(entry.at, nowMs)}
              </Text>
            </Group>
            <Text {...stylex.props(styles.text)}>{entry.text}</Text>
          </Paper>
        );
      })}
      <ReviewTextarea
        aria-label="Note to the agent"
        placeholder={
          thread.length === 0
            ? "Ask the agent something, or say what you'd change  ·  ⌘↵ to send"
            : "Reply  ·  ⌘↵ to send"
        }
        minRows={1}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onSubmitShortcut={submit}
        rightSection={
          <Tooltip label={`Post as ${owner} · ⌘↵`} withArrow>
            <ActionIcon
              variant="subtle"
              aria-label="Post note"
              onClick={submit}
              loading={post.isPending}
              disabled={draft.trim() === ""}
            >
              <SendHorizontal size={15} />
            </ActionIcon>
          </Tooltip>
        }
      />
      {post.error && (
        <Alert color="red" variant="light">
          {post.error.message}
        </Alert>
      )}
    </Stack>
  );
}
