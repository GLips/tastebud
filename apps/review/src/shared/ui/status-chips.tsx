import { Badge, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { AgentHostConnection } from "@tastebud/core/agent-hosts";
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

// The chips below are the review UI's remaining one-off states, named so each meaning has one shape.

// Connected is the green of what reaches agents, not connected the gray of what doesn't; Can't tell stays yellow.
const HOST_CONNECTION_TONES: Record<AgentHostConnection["state"], { word: string; color: string }> = {
  connected: { word: "Connected", color: "tastebud" },
  "not-connected": { word: "Not connected", color: "gray" },
  unknown: { word: "Can't tell", color: "yellow" },
};

/** Whether an agent host's own config wires Tastebud to this store, as Settings reads it. */
export function HostConnectionChip({ state }: { state: AgentHostConnection["state"] }) {
  const { word, color } = HOST_CONNECTION_TONES[state];
  return (
    <Badge color={color} w="fit-content">
      {word}
    </Badge>
  );
}

/** A proposal's scope Tastebud guessed from where the agent was working, until the owner touches it. */
export function ScopeGuessedChip() {
  return (
    <Tooltip label="Guessed from where the agent was working" withArrow>
      <Badge color="gray">guessed</Badge>
    </Tooltip>
  );
}

/** A path the place resolver lands nowhere: orange, as a scope that holds something back is. */
export function NoPlaceChip() {
  return <Badge color="orange">No place</Badge>;
}

/** Whether every place in use is reached by one of the kept test paths, or how many aren't. */
export function KeptPathReachChip({ unreached }: { unreached: number }) {
  return (
    <Badge color={unreached > 0 ? "orange" : "tastebud"}>
      {unreached > 0 ? `${unreached} ${unreached === 1 ? "place" : "places"} unreached` : "All reached"}
    </Badge>
  );
}

/** A decision that only changed its reason: the status stays as it was, so this is an event, not a state. */
export function ReasonChangedChip() {
  return <Badge color="gray">Reason changed</Badge>;
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
