import { Group, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationStatus } from "@tastebud/core/taste-vocabulary";

/** A derivation's status as one word: list sections, row marks and citations all read this. */
export const DERIVATION_STATUS_WORDS: Record<DerivationStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  retracted: "Retracted",
  superseded: "Superseded",
};

/** What each status means for the owner, in a phrase: a status word's tooltip and a list section's subtitle. */
export const DERIVATION_STATUS_MEANINGS: Record<DerivationStatus, string> = {
  pending: "Waiting for your decision",
  accepted: "You accepted these",
  rejected: "You turned these down; the reason stays on record",
  retracted: "You accepted these, then took them back",
  superseded: "Replaced by a newer revision you accepted",
};

// Filled dots are live states (waiting, in force, refused); hollow ones are out of force. Retracted is a solid
// ring and superseded a dashed one, so the two "no longer applies" states never read as the same mark.
const styles = stylex.create({
  dot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  pending: { backgroundColor: "var(--mantine-color-blue-5)" },
  accepted: { backgroundColor: "var(--mantine-color-teal-6)" },
  rejected: { backgroundColor: "var(--mantine-color-red-5)" },
  retracted: { borderWidth: "1.5px", borderStyle: "solid", borderColor: "var(--mantine-color-gray-6)" },
  superseded: { borderWidth: "1.5px", borderStyle: "dashed", borderColor: "var(--mantine-color-gray-5)" },
});

/** Status as a bare colour mark, for places that print the word beside it (section headers, the label below). */
export function DerivationStatusDot({ status }: { status: DerivationStatus }) {
  return (
    <Tooltip label={DERIVATION_STATUS_MEANINGS[status]} withArrow openDelay={150}>
      <span aria-label={DERIVATION_STATUS_WORDS[status]} role="img" {...stylex.props(styles.dot, styles[status])} />
    </Tooltip>
  );
}

/** Status as its mark and its word: the form a row or a citation uses, so no state is tooltip-only. */
export function DerivationStatusLabel({ status }: { status: DerivationStatus }) {
  return (
    <Tooltip label={DERIVATION_STATUS_MEANINGS[status]} withArrow openDelay={150}>
      <Group gap="xxs" wrap="nowrap" component="span">
        <span {...stylex.props(styles.dot, styles[status])} />
        <Text span size="xs" c="gray.7" fw={500}>
          {DERIVATION_STATUS_WORDS[status]}
        </Text>
      </Group>
    </Tooltip>
  );
}
