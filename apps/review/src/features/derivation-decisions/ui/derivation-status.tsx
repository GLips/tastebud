/**
 * The page's one rail: the state section (the state in colour, who decided it and when, the Reason,
 * and the actions that fit the state), a divider, then the properties. On a rejection the reason is the governing answer
 * to agents that propose the same again, so it edits in place: the rail's reason becomes the form,
 * and saving writes a new rejection. The reject form for a first rejection opens here too.
 */
import { Anchor, Box, Button, Divider, Group, Paper, Stack, Text, ThemeIcon, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationStatus } from "@tastebud/core/taste-vocabulary";
import { Undo2 } from "lucide-react";
import type { ReactNode } from "react";

import { describeAuthor, formatReviewDate, formatReviewTime } from "#review/shared/format.ts";
import { DERIVATION_STATUS_TONES, DERIVATION_STATUS_WORDS } from "#review/shared/ui/status-chips.tsx";

import { stateSettingDecisionOf } from "./derivation-history.ts";
import { DerivationActions } from "./derivation-review.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { canDecideDerivation, type DerivationReview } from "./use-derivation-review.ts";

// A decided state's left rule repeats the state's colour from DERIVATION_STATUS_TONES; stylex needs the values here.
const styles = stylex.create({
  rail: { overflow: "hidden" },
  state: { borderLeftWidth: "3px", borderLeftStyle: "solid" },
  accepted: { borderLeftColor: "var(--mantine-color-teal-6)" },
  rejected: { borderLeftColor: "var(--mantine-color-red-5)" },
  retracted: { borderLeftColor: "var(--mantine-color-gray-5)" },
  superseded: { borderLeftColor: "var(--mantine-color-gray-5)" },
  prose: { whiteSpace: "pre-wrap" },
});

// Only a decided state is tinted: a waiting one is a plain row, so its two buttons carry the colour.
const STATE_TINTS: Partial<Record<DerivationStatus, string>> = {
  accepted: "teal.0",
  rejected: "red.0",
  retracted: "gray.0",
  superseded: "gray.0",
};

/** The state's second line when no decision of the owner's set it; pending needs none. */
const STATE_UNDECIDED_LINES: Partial<Record<DerivationStatus, string>> = {
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

export function DerivationRail({
  review,
  acceptLabel,
  owner,
  properties,
}: {
  review: DerivationReview;
  acceptLabel: string;
  owner: string;
  properties: ReactNode;
}) {
  const { view } = review;
  const { color, icon: Icon } = DERIVATION_STATUS_TONES[view.status];
  // When and by whom the state was set; a reason edit or an undone decision doesn't move it.
  const decided = view.status === "pending" ? undefined : view.status;
  const setter = view.status === "pending" || view.status === "superseded" ? undefined : stateSettingDecisionOf(view);
  return (
    <Paper p={0} {...stylex.props(styles.rail)}>
      <Stack
        gap="sm"
        p="md"
        {...(decided !== undefined && { bg: STATE_TINTS[decided] })}
        {...stylex.props(decided !== undefined && styles.state, decided !== undefined && styles[decided])}
      >
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="xs" wrap="nowrap">
            <ThemeIcon color={color} variant="light" size="md">
              <Icon size={16} aria-hidden />
            </ThemeIcon>
            <Stack gap={0}>
              <Text size="md" fw={600}>
                {DERIVATION_STATUS_WORDS[view.status]}
              </Text>
              {setter === undefined ? (
                STATE_UNDECIDED_LINES[view.status] !== undefined && (
                  <Text size="xs" c="gray.7">
                    {STATE_UNDECIDED_LINES[view.status]}
                  </Text>
                )
              ) : (
                <Text size="xs" c="gray.7" title={formatReviewTime(setter.at)}>
                  {formatReviewDate(setter.at)} · {describeAuthor(setter.by, owner)}
                </Text>
              )}
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
        <DerivationActions review={review} acceptLabel={acceptLabel} />
      </Stack>
      <Divider />
      <Box p="md">{properties}</Box>
    </Paper>
  );
}
