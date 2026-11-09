/**
 * The state card at the top of the page's properties: the state in colour, who decided it and when,
 * the Reason, and the actions that fit the state. On a rejection the reason is the governing answer
 * to agents that propose the same again, so it edits in place: the card's reason becomes the form,
 * and saving writes a new rejection. The reject form for a first rejection opens here too.
 */
import { Anchor, Button, Group, Paper, Stack, Text, ThemeIcon, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationStatus } from "@tastebud/core/taste-vocabulary";
import { Undo2 } from "lucide-react";

import { describeAuthor, formatReviewDate, formatReviewTime } from "#review/shared/format.ts";
import { DERIVATION_STATUS_TONES, DERIVATION_STATUS_WORDS } from "#review/shared/ui/status-chips.tsx";

import { stateSettingDecisionOf } from "./derivation-history.ts";
import { DerivationActions } from "./derivation-review.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { canDecideDerivation, type DerivationReview } from "./use-derivation-review.ts";

// The left rule repeats the state's colour from DERIVATION_STATUS_TONES; stylex needs the values here.
const styles = stylex.create({
  card: { borderLeftWidth: "3px" },
  pending: { borderLeftColor: "var(--mantine-color-blue-5)" },
  accepted: { borderLeftColor: "var(--mantine-color-teal-6)" },
  rejected: { borderLeftColor: "var(--mantine-color-red-5)" },
  retracted: { borderLeftColor: "var(--mantine-color-gray-5)" },
  superseded: { borderLeftColor: "var(--mantine-color-gray-5)" },
  prose: { whiteSpace: "pre-wrap" },
});

const STATE_CARD_TINTS: Record<DerivationStatus, string> = {
  pending: "blue.0",
  accepted: "teal.0",
  rejected: "red.0",
  retracted: "gray.0",
  superseded: "gray.0",
};

/** The card's second line when no decision of the owner's set the state. */
const STATE_CARD_UNDECIDED_LINES: Partial<Record<DerivationStatus, string>> = {
  pending: "Waiting for your decision",
  superseded: "Replaced by a newer version",
};

function StateCardReason({ review }: { review: DerivationReview }) {
  const { view } = review;
  if (review.mode === "rejecting")
    return (
      <RejectReasonForm
        stacked
        initialReason={review.rejectDraft}
        changingReason={view.status === "rejected"}
        onReasonChange={review.setRejectDraft}
        pending={review.decision.pending}
        onCancel={() => review.setMode("idle")}
        onSubmit={(reason) => void review.reject(reason)}
      />
    );
  if (view.status === "pending" || view.reason === undefined) return null;
  const editable = view.status === "rejected" && review.mode === "idle" && canDecideDerivation(view);
  return (
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
      <Text size="sm" {...stylex.props(styles.prose)}>
        “{view.reason}”
      </Text>
    </Stack>
  );
}

export function DerivationStateCard({
  review,
  acceptLabel,
  owner,
}: {
  review: DerivationReview;
  acceptLabel: string;
  owner: string;
}) {
  const { view } = review;
  const { color, icon: Icon } = DERIVATION_STATUS_TONES[view.status];
  // When and by whom the state was set; a reason edit or an undone decision doesn't move it.
  const setter = view.status === "pending" || view.status === "superseded" ? undefined : stateSettingDecisionOf(view);
  return (
    <Paper p="md" bg={STATE_CARD_TINTS[view.status]} {...stylex.props(styles.card, styles[view.status])}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="xs" wrap="nowrap">
            <ThemeIcon color={color} variant="light" size="md">
              <Icon size={16} aria-hidden />
            </ThemeIcon>
            <Stack gap={0}>
              <Text size="md" fw={600}>
                {DERIVATION_STATUS_WORDS[view.status]}
              </Text>
              <Text size="xs" c="gray.7" title={setter === undefined ? undefined : formatReviewTime(setter.at)}>
                {setter === undefined
                  ? STATE_CARD_UNDECIDED_LINES[view.status]
                  : `${formatReviewDate(setter.at)} · ${describeAuthor(setter.by, owner)}`}
              </Text>
            </Stack>
          </Group>
          {review.undoable !== undefined && review.mode === "idle" && (
            <Tooltip label="Undo the decision just made · U" withArrow>
              <Button
                variant="subtle"
                color="gray"
                size="compact-sm"
                leftSection={<Undo2 size={14} />}
                onClick={review.undo}
              >
                Undo
              </Button>
            </Tooltip>
          )}
        </Group>
        <StateCardReason review={review} />
        {review.mode === "previewing" && (
          <Text size="xs" c="gray.7">
            Check where it applies and what it overlaps, then confirm under the title.
          </Text>
        )}
        <DerivationActions review={review} acceptLabel={acceptLabel} />
      </Stack>
    </Paper>
  );
}
