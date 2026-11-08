import { Button, Group } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

import { ReviewTextarea } from "#review/shared/ui/textarea.tsx";

const styles = stylex.create({
  grow: { flex: 1 },
});

/** A rejection always carries a reason: it is what a later agent is shown when it proposes the same idea again. */
export function RejectReasonForm({
  initialReason = "",
  onReasonChange,
  pending,
  onSubmit,
  onCancel,
}: {
  /** With `onReasonChange`, lets the caller keep a reason typed before the form was closed. */
  initialReason?: string;
  onReasonChange?: (reason: string) => void;
  pending: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState(initialReason);
  const trimmed = reason.trim();
  // While a reject is in flight, every way out of the form is closed, so it can't land twice or vanish.
  const submit = () => {
    if (trimmed !== "" && !pending) onSubmit(trimmed);
  };
  const cancel = () => {
    if (!pending) onCancel();
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Group gap="xs" align="flex-start" wrap="nowrap">
        <ReviewTextarea
          data-autofocus
          autoFocus
          aria-label="Why reject it? Agents that propose this again are shown your reason."
          placeholder={`Why not? Agents that propose this again will see your reason. ⌘↵ to reject, Esc to ${onReasonChange === undefined ? "cancel" : "close (your text is kept)"}`}
          minRows={1}
          {...stylex.props(styles.grow)}
          value={reason}
          readOnly={pending}
          onChange={(event) => {
            setReason(event.currentTarget.value);
            onReasonChange?.(event.currentTarget.value);
          }}
          onSubmitShortcut={submit}
          onCancelShortcut={cancel}
        />
        <Button variant="subtle" color="gray" onClick={cancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" color="red" disabled={trimmed === ""} loading={pending}>
          Reject
        </Button>
      </Group>
    </form>
  );
}
