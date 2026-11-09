import { UserRound } from "lucide-react";

import { NeutralMarkChip } from "./status-chips.tsx";
import { otherSubjectOf, type SubjectOf } from "./subject-of.ts";

/**
 * The person a derivation is about, as a chip beside its scope chips: "About Jordan", with the label
 * their sources give them and their account on hover. Renders nothing when it is about the owner.
 */
export function SubjectChip({
  summary,
  owner,
  nameOnly = false,
}: {
  summary: SubjectOf;
  owner: string | undefined;
  /** Under a label that already says "About", the chip names the person and nothing else. */
  nameOnly?: boolean;
}) {
  const subject = otherSubjectOf(summary, owner);
  if (subject === undefined) return null;
  // Sources label a speaker "Jordan (Acme marketing)"; the chip keeps the name and leaves the rest to the tooltip.
  const name = subject.label.replace(/\s*\(.*\)$/, "");
  return (
    <NeutralMarkChip
      icon={UserRound}
      label={nameOnly ? name : `About ${name}`}
      tooltip={`About ${subject.label} · ${subject.account}`}
    />
  );
}
