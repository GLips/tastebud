/**
 * A note to the agents, written inside an inbox card so discussing a proposal doesn't leave triage.
 * The full thread stays one link away on the proposal's page.
 */
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { THREAD_NOTE_STALES } from "#review/shared/query-keys.ts";
import { refreshReviewQueriesAfterWrite } from "#review/shared/refresh-after-write.ts";
import { unwrapReviewOutcome } from "#review/shared/review-outcome.ts";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { ReviewTextarea } from "#review/shared/ui/textarea.tsx";

import { postOwnerThreadNote } from "../controllers/thread-note.ts";

/** Closed, being written, or just saved; a saved note says so rather than vanishing. */
export type InboxNoteState = "closed" | "writing" | "saved";

function FullThreadLink({ derivationId }: { derivationId: string }) {
  return (
    <AnchorLink to="/derivations/$id" params={{ id: derivationId }} hash="thread" size="xs">
      Open the full thread
    </AnchorLink>
  );
}

function InboxNoteComposer({
  derivationId,
  onSaved,
  onClose,
}: {
  derivationId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const post = useMutation({
    mutationFn: async (note: string) =>
      unwrapReviewOutcome(await postOwnerThreadNote({ data: { ref: derivationId, text: note } })),
    onSuccess: onSaved,
    onSettled: () => refreshReviewQueriesAfterWrite(queryClient, THREAD_NOTE_STALES),
  });
  const send = () => {
    if (text.trim() === "" || post.isPending) return;
    post.mutate(text.trim());
  };
  return (
    <Stack gap="2xs">
      <ReviewTextarea
        // Opened by D or the Discuss button, so typing starts at once.
        autoFocus
        aria-label="Note to the agents"
        placeholder="Ask the agent about this, or say what would change your mind"
        minRows={2}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        onSubmitShortcut={send}
        onCancelShortcut={onClose}
        disabled={post.isPending}
      />
      {post.isError && (
        <Alert color="red" variant="light" py="xxs">
          {post.error.message}
        </Alert>
      )}
      <Group gap="xs">
        <Button size="xs" loading={post.isPending} disabled={text.trim() === ""} onClick={send}>
          Send note
        </Button>
        <Button size="xs" variant="subtle" color="gray" onClick={onClose}>
          Cancel
        </Button>
        <Text size="xs" c="dimmed">
          ⌘↵ sends · Esc closes
        </Text>
        <FullThreadLink derivationId={derivationId} />
      </Group>
    </Stack>
  );
}

export function InboxNote({
  derivationId,
  state,
  onStateChange,
}: {
  derivationId: string;
  state: InboxNoteState;
  onStateChange: (state: InboxNoteState) => void;
}) {
  if (state === "writing")
    return (
      <InboxNoteComposer
        derivationId={derivationId}
        onSaved={() => onStateChange("saved")}
        onClose={() => onStateChange("closed")}
      />
    );
  if (state === "closed") return null;
  // Agents read notes when they next listen, not at once, so "sent" would overpromise.
  return (
    <Group gap="xs">
      <Text size="xs" c="dimmed">
        Saved; the agent sees it when it next listens.
      </Text>
      <FullThreadLink derivationId={derivationId} />
    </Group>
  );
}
