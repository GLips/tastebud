import { Box, ActionIcon, Alert, Badge, Code, CopyButton, Group, Paper, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ThreadEntryRecord } from "@tastebud/core/records";
import type { ListenerHeartbeat } from "@tastebud/core/review-threads";
import { Check, Copy, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { describeAuthor, formatReviewTime, formatTimeAgo } from "#review/shared/format.ts";
import { THREAD_NOTE_STALES } from "#review/shared/query-keys.ts";
import { refreshReviewQueriesAfterWrite } from "#review/shared/refresh-after-write.ts";
import { unwrapReviewOutcome } from "#review/shared/review-outcome.ts";
import { ReviewTextarea } from "#review/shared/ui/textarea.tsx";

import { postOwnerThreadNote } from "../controllers/thread-note.ts";
import { useReviewClockMs } from "./use-review-clock.ts";

const styles = stylex.create({
  entry: { display: "flex", flexDirection: "column", gap: "4px" },
  owner: { backgroundColor: "var(--mantine-color-tastebud-0)", borderColor: "var(--mantine-color-tastebud-1)" },
  text: { whiteSpace: "pre-wrap" },
  dot: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" },
  dotLive: { backgroundColor: "var(--mantine-color-teal-5)" },
  dotIdle: { backgroundColor: "var(--mantine-color-gray-4)" },
});

/**
 * Whether a note posted now would wake an agent: any listener with a fresh heartbeat. Notes are saved
 * either way; an unanswered one reaches the next agent that starts listening.
 */
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
    <Group gap="xs">
      <Box component="span" {...stylex.props(styles.dot, styles.dotIdle)} />
      <Text size="xs" c="dimmed">
        No agent listening now · notes wait here
      </Text>
    </Group>
  );
}

const LISTEN_COMMAND = "tastebud review listen --as <name>";

/** How to get an answer when nobody is listening: the command an agent runs, shown and copyable. */
function StartListenerHint() {
  return (
    <Group gap="2xs" wrap="nowrap">
      <Text size="xs" c="dimmed">
        For an answer, ask an agent to run
      </Text>
      <Code fz="xs">{LISTEN_COMMAND}</Code>
      <CopyButton value={LISTEN_COMMAND}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "Copied" : "Copy the command"} withArrow>
            <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Copy the listen command" onClick={copy}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

/**
 * One derivation's discussion, oldest first, with a composer that always writes as the store owner.
 * Arriving to discuss focuses the composer, so what the owner types is a note, never a page key.
 */
export function DerivationThread({
  derivationId,
  thread,
  owner,
  listeners,
  focusComposer,
}: {
  derivationId: string;
  thread: ReadonlyArray<ThreadEntryRecord>;
  owner: string;
  listeners: ReadonlyArray<ListenerHeartbeat>;
  focusComposer: boolean;
}) {
  const nowMs = useReviewClockMs();
  // A wrapper, because the shared textarea takes no ref.
  const composer = useRef<HTMLDivElement>(null);
  const composerField = () => composer.current?.querySelector("textarea");
  useEffect(() => {
    if (focusComposer) composer.current?.querySelector("textarea")?.focus();
  }, [focusComposer]);
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
      {!listeners.some((listener) => listener.listening) && <StartListenerHint />}
      {thread.map((entry) => {
        const isOwner = entry.author === owner;
        return (
          <Paper key={entry.id} px="sm" py="xs" {...stylex.props(styles.entry, isOwner && styles.owner)}>
            <Group gap="xs">
              <Badge size="xs" variant={isOwner ? "filled" : "light"} color={isOwner ? "tastebud" : "gray"} tt="none">
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
      <Box ref={composer}>
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
          // The first Esc leaves the box, keeping the draft; the page's Esc then goes back.
          onCancelShortcut={() => composerField()?.blur()}
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
      </Box>
      {post.error && (
        <Alert color="red" variant="light" title="Note not saved">
          {post.error.message}
        </Alert>
      )}
    </Stack>
  );
}
