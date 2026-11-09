import { Text } from "@mantine/core";
import type { DerivationSummary } from "@tastebud/core/record-views";

export type SubjectOf = Pick<DerivationSummary, "subject" | "subjectLabel">;

/** Who a derivation is about, or undefined when it is about the owner, so callers never test the subject. */
export const otherSubjectOf = ({ subject, subjectLabel }: SubjectOf, owner: string | undefined) =>
  subject === undefined || subject === "owner" || subject === owner
    ? undefined
    : { account: subject, label: subjectLabel ?? subject };

/**
 * "About Jordan (Acme marketing)": who a derivation is about, by the name their sources give them, with the
 * raw account in the tooltip. Renders nothing when it is about the owner.
 */
export function SubjectLabel({
  summary,
  owner,
  sentenceStart = false,
}: {
  summary: SubjectOf;
  /** The store owner's account (`catalog.owner`); a derivation about them needs no label. */
  owner: string | undefined;
  /** "About …" to open a line or heading; "about …" mid-sentence. */
  sentenceStart?: boolean;
}) {
  const subject = otherSubjectOf(summary, owner);
  if (subject === undefined) return null;
  return (
    <Text span inherit title={subject.account}>
      {sentenceStart ? "About" : "about"} {subject.label}
    </Text>
  );
}
