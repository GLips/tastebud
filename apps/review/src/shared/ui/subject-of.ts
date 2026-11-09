import type { DerivationSummary } from "@tastebud/core/record-views";

export type SubjectOf = Pick<DerivationSummary, "subject" | "subjectLabel">;

/** Who a derivation is about, or undefined when it is about the owner, so callers never test the subject. */
export const otherSubjectOf = ({ subject, subjectLabel }: SubjectOf, owner: string | undefined) =>
  subject === undefined || subject === "owner" || subject === owner
    ? undefined
    : { account: subject, label: subjectLabel ?? subject };
