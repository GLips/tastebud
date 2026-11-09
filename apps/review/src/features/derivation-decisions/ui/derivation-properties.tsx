/**
 * A derivation's properties as labelled rows, Linear-style: where it applies (editable while it can be
 * decided), who it is about, when it was proposed and by whom, its kind and its id. The state, and
 * who decided it when, are the title row's badge and the page's state card, so they aren't repeated here.
 */
import { Text, Tooltip } from "@mantine/core";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import type { DerivationView } from "@tastebud/core/record-views";
import type { RecallPolicy } from "@tastebud/core/taste-vocabulary";
import type { ReactNode } from "react";

import { describeAuthor, formatReviewDate, formatReviewTime } from "#review/shared/format.ts";
import { FactList, FactRow } from "#review/shared/ui/fact-row.tsx";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { SubjectChip } from "#review/shared/ui/subject-chip.tsx";
import { otherSubjectOf } from "#review/shared/ui/subject-label.tsx";

import { DerivationIdCopy } from "./derivation-header.tsx";

const RECALL_WORDS: Record<RecallPolicy, string> = {
  inject: "Agents are told it automatically",
  pull: "Agents find it when they look",
  never: "Never told to agents",
};

export function DerivationProperties({
  view,
  kind,
  owner,
  scope,
  host,
}: {
  view: DerivationView;
  kind: DerivedKindView | undefined;
  owner: string;
  /** The Scope value: the picker while it can be decided, chips otherwise. */
  scope: ReactNode;
  /** The inbox pane leaves out Kind (its tab says it) and ID (the full page has it). */
  host: "page" | "pane";
}) {
  return (
    <FactList>
      <FactRow label="Scope">{scope}</FactRow>
      {otherSubjectOf(view, owner) !== undefined && (
        <FactRow label="About">
          <SubjectChip summary={view} owner={owner} />
        </FactRow>
      )}
      <FactRow label="Proposed">
        <Text size="sm" title={formatReviewTime(view.proposedAt)}>
          {formatReviewDate(view.proposedAt)}
        </Text>
      </FactRow>
      <FactRow label="By">
        <Text size="sm">{describeAuthor(view.derivation.proposed_by, owner)}</Text>
      </FactRow>
      {host === "page" && (
        <>
          <FactRow label="Kind">
            <Tooltip label={kind === undefined ? "This kind is retired" : RECALL_WORDS[kind.recall]} withArrow>
              <Text size="sm" span>
                {capitalize(view.kindLabel)}
                {view.retired && " (retired)"}
              </Text>
            </Tooltip>
          </FactRow>
          <FactRow label="ID">
            <DerivationIdCopy id={view.id} />
          </FactRow>
        </>
      )}
    </FactList>
  );
}
