import { Badge, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationStatus } from "@tastebud/core/taste-vocabulary";
import { CircleCheck, CircleDot, CircleMinus, CircleX, CornerDownRight, type LucideIcon } from "lucide-react";

/** A derivation's status as one word: list sections, row marks and citations all read this. */
export const DERIVATION_STATUS_WORDS: Record<DerivationStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  retracted: "Retracted",
  superseded: "Superseded",
};

/** What each status means for the owner, in a phrase: the tooltip on a status mark. */
const DERIVATION_STATUS_MEANINGS: Record<DerivationStatus, string> = {
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

/** Status as a bare colour mark, only beside a header that prints the status word (a list's section rows). */
export function DerivationStatusDot({ status }: { status: DerivationStatus }) {
  return (
    <Tooltip label={DERIVATION_STATUS_MEANINGS[status]} withArrow openDelay={150}>
      <span aria-label={DERIVATION_STATUS_WORDS[status]} role="img" {...stylex.props(styles.dot, styles[status])} />
    </Tooltip>
  );
}

// Waiting blue, in force green, refused red, out of force gray: colour is reserved for state.
export const DERIVATION_STATUS_TONES: Record<DerivationStatus, { color: string; icon: LucideIcon }> = {
  pending: { color: "blue", icon: CircleDot },
  accepted: { color: "teal", icon: CircleCheck },
  rejected: { color: "red", icon: CircleX },
  retracted: { color: "gray", icon: CircleMinus },
  superseded: { color: "gray", icon: CornerDownRight },
};

/**
 * A derivation's state, the one shape it takes wherever a state is shown on its own: its icon and word on its
 * colour (Pending blue, Accepted green, Rejected red, Retracted and Superseded gray). Superseded's arrow points
 * at whatever replaced it.
 */
export function DerivationStatusBadge({ status }: { status: DerivationStatus }) {
  const { color, icon: Icon } = DERIVATION_STATUS_TONES[status];
  return (
    <Tooltip label={DERIVATION_STATUS_MEANINGS[status]} withArrow openDelay={150}>
      <Badge color={color} leftSection={<Icon size={12} strokeWidth={2.25} aria-hidden />}>
        {DERIVATION_STATUS_WORDS[status]}
      </Badge>
    </Tooltip>
  );
}
