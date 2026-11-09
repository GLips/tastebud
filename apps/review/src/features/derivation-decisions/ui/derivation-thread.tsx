/**
 * The note composer at the bottom of a derivation's activity feed: it always writes as the store owner,
 * and one quiet line beside it says whether an agent is listening. The notes themselves are events in
 * the feed (`derivation-activity.tsx`).
 */
import { Box, ActionIcon, Alert, Anchor, Code, CopyButton, Group, Paper, Popover, Stack, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ListenerHeartbeat } from "@tastebud/core/review-threads";
import { Check, Copy, SendHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";

import { formatTimeAgo } from "#review/shared/format.ts";
import { THREAD_NOTE_STALES } from "#review/shared/query-keys.ts";
import { refreshReviewQueriesAfterWrite } from "#review/shared/refresh-after-write.ts";
import { unwrapReviewOutcome } from "#review/shared/review-outcome.ts";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";
import { ReviewTextarea } from "#review/shared/ui/textarea.tsx";

import { postOwnerThreadNote } from "../controllers/thread-note.ts";
import { setThreadNoteDraft, useThreadNoteDraft } from "./thread-note-drafts.ts";
import { useReviewClockMs } from "./use-review-clock.ts";

const styles = stylex.create({
  dot: { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" },
  dotLive: { backgroundColor: "var(--mantine-color-teal-5)" },
});

const LISTEN_COMMAND = "tastebud review listen --as <name>";

/** Who would answer a note posted now; when nobody is, the command that starts a listener is one click away. */
function AgentListeningLine({ listeners }: { listeners: ReadonlyArray<ListenerHeartbeat> }) {
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
          <SupportingText tier="faint">{live.map((listener) => listener.name).join(", ")} listening</SupportingText>
        </Group>
      </Tooltip>
    );
  }
  return (
    <Popover withArrow shadow="md" position="bottom-start">
      <Popover.Target>
        <Anchor component="button" size="xs" c="dimmed" underline="hover">
          No agent listening
        </Anchor>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="2xs">
          <SupportingText tier="secondary">Notes wait here. An agent picks them up when it runs</SupportingText>
          <Group gap="2xs" wrap="nowrap">
            <Code fz="xs">{LISTEN_COMMAND}</Code>
            <CopyButton value={LISTEN_COMMAND}>
              {({ copied, copy }) => (
                <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Copy the listen command" onClick={copy}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </ActionIcon>
              )}
            </CopyButton>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/** Arriving to discuss focuses the composer, so what the owner types is a note, never a page key. */
export function DerivationNoteComposer({
  derivationId,
  owner,
  listeners,
  focusComposer,
}: {
  derivationId: string;
  owner: string;
  listeners: ReadonlyArray<ListenerHeartbeat>;
  focusComposer: boolean;
}) {
  // A wrapper, because the shared textarea takes no ref.
  const composer = useRef<HTMLDivElement>(null);
  const composerField = () => composer.current?.querySelector("textarea");
  useEffect(() => {
    if (focusComposer) composer.current?.querySelector("textarea")?.focus();
  }, [focusComposer]);
  const queryClient = useQueryClient();
  const draft = useThreadNoteDraft(derivationId);
  const setDraft = (text: string) => setThreadNoteDraft(derivationId, text);
  const post = useMutation({
    // The id travels with the note: the inbox pane may have moved to another row by the time it lands.
    mutationFn: async ({ ref, text }: { ref: string; text: string }) =>
      unwrapReviewOutcome(await postOwnerThreadNote({ data: { ref, text } })),
    // Leaving the box hands single-letter shortcuts back to the page. Not if the reviewer has since
    // moved to another row and may be typing there.
    onSuccess: (_posted, { ref }) => {
      setThreadNoteDraft(ref, "");
      if (ref === derivationId) composerField()?.blur();
    },
    onSettled: () => refreshReviewQueriesAfterWrite(queryClient, THREAD_NOTE_STALES),
  });
  const submit = () => {
    if (draft.trim() !== "" && !post.isPending) post.mutate({ ref: derivationId, text: draft });
  };
  return (
    <Stack gap="2xs" align="flex-start">
      <Box ref={composer} w="100%">
        <ReviewTextarea
          aria-label="Note to the agent"
          placeholder="Leave a note for the agent…   ⌘↵"
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
      <AgentListeningLine listeners={listeners} />
      {post.error && (
        <Alert color="red" variant="light" title="Note not saved">
          {post.error.message}
        </Alert>
      )}
    </Stack>
  );
}
