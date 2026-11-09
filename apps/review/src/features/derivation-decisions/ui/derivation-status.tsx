/**
 * The Reason a decided derivation carries, labelled and quoted under its title. On a rejection it is the
 * governing answer to agents that propose the same again, so it edits in place: the block becomes the
 * reason form, and saving writes a new rejection.
 */
import { Anchor, Box, Group, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";

import { RejectReasonForm } from "./reject-reason-form.tsx";
import { canDecideDerivation, type DerivationReview } from "./use-derivation-review.ts";

const styles = stylex.create({
  block: {
    borderLeftWidth: "3px",
    borderLeftStyle: "solid",
    borderLeftColor: "var(--mantine-color-gray-3)",
    paddingLeft: "12px",
    paddingBlock: "2px",
  },
  rejected: { borderLeftColor: "var(--mantine-color-red-4)" },
  prose: { whiteSpace: "pre-wrap" },
});

export function DerivationReasonBlock({ review }: { review: DerivationReview }) {
  const { view, decision } = review;
  const rejected = view.status === "rejected";
  if (rejected && review.mode === "rejecting")
    return (
      <RejectReasonForm
        initialReason={review.rejectDraft}
        changingReason
        onReasonChange={review.setRejectDraft}
        pending={decision.pending}
        onCancel={() => review.setMode("idle")}
        onSubmit={(reason) => void review.reject(reason)}
      />
    );
  if (view.status === "pending" || view.reason === undefined) return null;
  const editable = rejected && review.mode === "idle" && canDecideDerivation(view);
  return (
    <Box {...stylex.props(styles.block, rejected && styles.rejected)}>
      <Stack gap="3xs">
        <Group gap="xs">
          <Text size="xs" c="dimmed" fw={500}>
            Reason
          </Text>
          {editable && (
            <Anchor component="button" size="xs" onClick={review.editReason}>
              Edit
            </Anchor>
          )}
        </Group>
        <Text {...stylex.props(styles.prose)}>“{view.reason}”</Text>
      </Stack>
    </Box>
  );
}
