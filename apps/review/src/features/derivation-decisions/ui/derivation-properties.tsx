/**
 * A derivation's properties as labelled rows, Linear-style: where it applies (editable while it can be
 * decided), who decided it and when, who it is about, who proposed it and when, its kind and its id.
 * The status itself is the title row's badge, so it isn't repeated here.
 */
import { Text, Tooltip } from "@mantine/core";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import type { DerivationView } from "@tastebud/core/record-views";
import type { RecallPolicy } from "@tastebud/core/taste-vocabulary";
import type { ReactNode } from "react";

import { describeAuthor, formatReviewDate, formatReviewTime } from "#review/shared/format.ts";
import { FactList, FactRow } from "#review/shared/ui/fact-row.tsx";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";

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
  const lastDecision = view.decisions.at(-1);
  const decided = view.status !== "pending" && view.decidedAt !== undefined;
  const about = view.subject !== undefined && view.subject !== "owner" && view.subject !== owner;
  return (
    <FactList>
      <FactRow label="Scope">{scope}</FactRow>
      {decided && (
        <FactRow label="Decided">
          <Text size="sm" title={formatReviewTime(view.decidedAt)}>
            {formatReviewDate(view.decidedAt)}
            {lastDecision !== undefined && ` · ${describeAuthor(lastDecision.by, owner)}`}
          </Text>
        </FactRow>
      )}
      {about && (
        <FactRow label="About">
          <Text size="sm" title={view.subject}>
            {view.subjectLabel ?? view.subject}
          </Text>
        </FactRow>
      )}
      <FactRow label="Proposed">
        <Text size="sm" title={formatReviewTime(view.proposedAt)}>
          {formatReviewDate(view.proposedAt)} · {describeAuthor(view.derivation.proposed_by, owner)}
        </Text>
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
