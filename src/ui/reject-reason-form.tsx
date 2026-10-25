import { Button, Group, Textarea } from "@mantine/core";
import { useState } from "react";

/** A rejection always carries a reason: it is what a later agent is shown when it proposes the same idea again. */
export function RejectReasonForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
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
        <Textarea
          data-autofocus
          autoFocus
          aria-label="Why reject it? Agents that propose this again are shown your reason."
          placeholder="Why not? Agents that propose this again will see your reason. ⌘↵ to reject, Esc to cancel"
          autosize
          minRows={1}
          style={{ flex: 1 }}
          value={reason}
          readOnly={pending}
          onChange={(event) => setReason(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape") cancel();
          }}
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
