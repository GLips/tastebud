import { Badge, Tooltip } from "@mantine/core";
import { UserRound } from "lucide-react";

import { otherSubjectOf, type SubjectOf } from "./subject-of.ts";

/**
 * The person a derivation is about, as a chip beside its scope chips: "Jordan", with the label their
 * sources give them and their account on hover. Renders nothing when it is about the owner.
 */
export function SubjectChip({ summary, owner }: { summary: SubjectOf; owner: string | undefined }) {
  const subject = otherSubjectOf(summary, owner);
  if (subject === undefined) return null;
  // Sources label a speaker "Jordan (Acme marketing)"; the chip keeps the name and leaves the rest to the tooltip.
  const name = subject.label.replace(/\s*\(.*\)$/, "");
  return (
    <Tooltip label={`About ${subject.label} · ${subject.account}`} withArrow openDelay={250}>
      <Badge color="gray" leftSection={<UserRound size={11} strokeWidth={2} aria-hidden />}>
        {name}
      </Badge>
    </Tooltip>
  );
}
