import { Badge, Tooltip } from "@mantine/core";
import type { RecallPolicy } from "@tastebud/core/taste-vocabulary";
import { Archive, BookOpen, type LucideIcon, Send } from "lucide-react";

import { RECALL_POLICY_LABELS } from "./kind-identity.tsx";

// Sent is the green the Sent outcome uses, looked up is cyan, the backlog gray.
const POLICY_TONES: Record<RecallPolicy, { color: string; icon: LucideIcon }> = {
  inject: { color: "tastebud", icon: Send },
  pull: { color: "cyan", icon: BookOpen },
  never: { color: "gray", icon: Archive },
};

/** How a kind's accepted items reach agents, as one chip: "Sent with prompts", "Looked up when asked", "Not sent: backlog". */
export function RecallPolicyChip({ policy, about }: { policy: RecallPolicy; about?: string }) {
  const { color, icon: Icon } = POLICY_TONES[policy];
  const chip = (
    <Badge color={color} leftSection={<Icon size={11} strokeWidth={2} aria-hidden />}>
      {RECALL_POLICY_LABELS[policy]}
    </Badge>
  );
  if (about === undefined) return chip;
  return (
    <Tooltip label={about} withArrow multiline maw={320} openDelay={150}>
      {chip}
    </Tooltip>
  );
}
