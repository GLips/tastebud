import { Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationStatus } from "@taste/core/vocabulary";

const STATUS_COLORS: Record<DerivationStatus, string> = {
  pending: "blue",
  accepted: "teal",
  rejected: "red",
  retracted: "gray",
  superseded: "gray",
};

const DERIVATION_STATUS_LABELS: Record<DerivationStatus, string> = {
  pending: "Pending review",
  accepted: "Accepted",
  rejected: "Rejected",
  retracted: "Retracted",
  superseded: "Replaced by a newer revision",
};

const styles = stylex.create({
  dot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  hollow: { borderWidth: "1.5px", borderStyle: "solid", backgroundColor: "transparent" },
});

/** Status as a colour dot: dense lists carry many of these, and the word lives in the tooltip. */
export function DerivationStatusDot({ status }: { status: DerivationStatus }) {
  const color = `var(--mantine-color-${STATUS_COLORS[status]}-${status === "accepted" ? 6 : 5})`;
  const hollow = status === "retracted" || status === "superseded";
  return (
    <Tooltip label={DERIVATION_STATUS_LABELS[status]} withArrow openDelay={150}>
      <span
        aria-label={DERIVATION_STATUS_LABELS[status]}
        role="img"
        {...stylex.props(styles.dot, hollow && styles.hollow)}
        style={hollow ? { borderColor: color } : { backgroundColor: color }}
      />
    </Tooltip>
  );
}
