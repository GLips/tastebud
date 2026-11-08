import { Text } from "@mantine/core";
import type { DerivationSummary } from "@tastebud/core/record-views";

/**
 * "About Jordan (Acme marketing)": who a derivation is about, by the name their sources give them, with the
 * raw account in the tooltip. Renders nothing when it is about the owner, so callers never test the subject.
 */
export function SubjectLabel({
  summary,
  owner,
  sentenceStart = false,
}: {
  summary: Pick<DerivationSummary, "subject" | "subjectLabel">;
  /** The store owner's account (`catalog.owner`); a derivation about them needs no label. */
  owner: string | undefined;
  /** "About …" to open a line or heading; "about …" mid-sentence. */
  sentenceStart?: boolean;
}) {
  const { subject, subjectLabel } = summary;
  if (subject === undefined || subject === "owner" || subject === owner) return null;
  return (
    <Text span inherit title={subject}>
      {sentenceStart ? "About" : "about"} {subjectLabel ?? subject}
    </Text>
  );
}
