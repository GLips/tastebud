import { Badge } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * What Recall did with an item for one prompt, apart from the item's own status: sent, given only on request,
 * held back by its scope, not sent (its policy, history or kind), or not matched by the words.
 */
export type RecallOutcomeTone = "sent" | "on-request" | "held-back" | "not-sent" | "not-matched";

// The same green and cyan as the policy that leads to each; held back is orange because a scope stopped it.
const OUTCOME_TONES: Record<RecallOutcomeTone, { word: string; color: string }> = {
  sent: { word: "Sent", color: "tastebud" },
  "on-request": { word: "On request", color: "cyan" },
  "held-back": { word: "Held back", color: "orange" },
  "not-sent": { word: "Not sent", color: "gray" },
  "not-matched": { word: "Not matched", color: "gray" },
};

/** One Recall outcome as a chip; `children` names a narrower reason in the same tone ("History", "Retired kind"). */
export function RecallOutcomeChip({ outcome, children }: { outcome: RecallOutcomeTone; children?: ReactNode }) {
  const { word, color } = OUTCOME_TONES[outcome];
  return <Badge color={color}>{children ?? word}</Badge>;
}
