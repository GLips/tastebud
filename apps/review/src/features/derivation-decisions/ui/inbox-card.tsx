/**
 * One pending proposal in the inbox: a compact row in the queue and, while selected, the detail pane
 * beside it where it is decided. The pane is portalled into the page's pane column, so the card keeps
 * its triage state (rejecting, previewing, its decision and Undo) whichever row is open. The scope
 * draft lives with the inbox so a bulk Believe can tell edited cards apart.
 */
import type { InboxCard } from "@tastebud/core/inbox";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { isCompleteScope, type ScopeDraft } from "@tastebud/core/places";
import { Clock, History, MessageSquare, PencilLine } from "lucide-react";
import type { Ref } from "react";
import { createPortal } from "react-dom";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import type { DerivationCaution } from "#review/shared/ui/caution-chip.tsx";
import { SubjectChip } from "#review/shared/ui/subject-chip.tsx";
import { otherSubjectOf } from "#review/shared/ui/subject-of.ts";

import { versionsOf } from "./derivation-related.tsx";
import { InboxDecidedRow, type InboxDecidedRowLatest } from "./inbox-decided-row.tsx";
import { InboxProposalPane } from "./inbox-proposal-pane.tsx";
import { InboxProposalRow, type InboxRowCheck, type InboxRowNote } from "./inbox-proposal-row.tsx";
import { type InboxBatch, type InboxCardHandle, useInboxCardTriage } from "./use-inbox-card-triage.ts";

/**
 * What deserves reading before deciding, as a row shows it before the proposal is opened. Near matches
 * are tagged as the accept preview tags them, and an earlier version of this proposal is never one: one
 * pair, one label (see versionsOf).
 */
const rowCautionsOf = (
  card: InboxCard,
  { edited, backlog }: { edited: boolean; backlog: boolean },
): ReadonlyArray<DerivationCaution> => {
  const view = card.derivation;
  const earlier = new Set(versionsOf(view).earlier.map(({ summary }) => summary.id));
  // An edited scope is re-checked in the preview, so the row stops vouching for the proposed scope's matches.
  const near = edited ? [] : card.needsAcknowledgement.filter((match) => !earlier.has(match.id));
  const cautions: ReadonlyArray<DerivationCaution | false> = [
    !backlog && view.contradictingSources.length > 0 && "says-the-opposite",
    near.some((match) => match.status === "rejected") && "near-a-rejection",
    near.some((match) => match.status !== "rejected") && "near-a-repeat",
  ];
  return cautions.filter((caution) => caution !== false);
};

/**
 * The row's neutral facts: queued in a bulk decision, a newer version of something, its scope mid-edit,
 * its notes. A scope edited to somewhere whole shows as its place chip instead, so "Scope edited" covers
 * only a draft not yet a place.
 */
const rowNotesOf = (card: InboxCard, { editing, queued }: { editing: boolean; queued: boolean }) => {
  const notes = card.derivation.thread.length;
  const facts: ReadonlyArray<InboxRowNote | false> = [
    queued && { icon: Clock, text: "Queued", tooltip: "Waiting its turn in a bulk decision" },
    versionsOf(card.derivation).earlier.length > 0 && {
      icon: History,
      text: "Newer version",
      tooltip: "Proposed again in place of an earlier version",
    },
    editing && { icon: PencilLine, text: "Scope edited", tooltip: "You're changing where it applies" },
    notes > 0 && {
      icon: MessageSquare,
      text: String(notes),
      tooltip: notes === 1 ? "1 note in its thread" : `${notes} notes in its thread`,
    },
  ];
  return facts.filter((fact) => fact !== false);
};

export function InboxProposalCard({
  card,
  kind,
  owner,
  selected,
  check,
  queued,
  draft,
  known,
  pane,
  cardHandles,
  onSelect,
  onDraftChange,
  onEngagedChange,
  onDecided,
  decided,
  latestDecided,
  onUndone,
  ref,
}: {
  card: InboxCard;
  kind: DerivedKindView;
  /** The store owner's account, so a row about anyone else shows who. */
  owner: string | undefined;
  selected: boolean;
  check: InboxRowCheck;
  /** Waiting its turn in a bulk decision: locked, so what the batch counted as unchanged stays so. */
  queued: boolean;
  /** The edited scope, or undefined while it is as proposed. */
  draft: ScopeDraft | undefined;
  known: KnownPlaces;
  /** The page's detail column, which the selected card renders into. */
  pane: HTMLElement | null;
  /** Where the card offers its decisions and undo to the page, so a bulk decision goes through the card. */
  cardHandles: Map<string, InboxCardHandle>;
  onSelect: () => void;
  onDraftChange: (draft: ScopeDraft | undefined) => void;
  /** True while this card holds the keyboard: editing, rejecting, previewing or submitting. */
  onEngagedChange: (engaged: boolean) => void;
  onDecided: (batch: InboxBatch | undefined) => void;
  /** Decided from this card: it folds to its outcome with Undo, staying mounted so the undo survives. */
  decided: boolean;
  /** Set while part of the newest decision made in the inbox, which `u` undoes. */
  latestDecided: InboxDecidedRowLatest | undefined;
  /** The undo landed and the proposal is pending again. */
  onUndone: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  const triage = useInboxCardTriage({
    card,
    draft,
    known,
    selected,
    queued,
    selectionHoldsKeys: check.shown,
    cardHandles,
    onDraftChange,
    onEngagedChange,
    onDecided,
    onUndone,
  });
  const view = card.derivation;
  // The section is the proposed scope, so only an edit puts a different place on the row.
  const editedTo = triage.edited && isCompleteScope(triage.shownScope) ? triage.shownScope : undefined;

  if (decided)
    return (
      <InboxDecidedRow
        id={view.id}
        statement={view.statement}
        undoable={triage.decision.undoable}
        undoing={triage.decision.pending}
        onUndo={() => void triage.undo()}
        latest={latestDecided}
      />
    );

  return (
    <>
      <InboxProposalRow
        ref={ref}
        statement={view.statement}
        chips={{
          scope: editedTo,
          subject: otherSubjectOf(view, owner) === undefined ? null : <SubjectChip summary={view} owner={owner} />,
          cautions: rowCautionsOf(card, { edited: triage.edited, backlog: kind.recall === "never" }),
          notes: rowNotesOf(card, { editing: triage.edited && editedTo === undefined, queued }),
        }}
        selected={selected}
        onSelect={onSelect}
        check={check}
      />
      {selected &&
        pane !== null &&
        createPortal(
          <InboxProposalPane card={card} kind={kind} known={known} triage={triage} queued={queued} pane={pane} />,
          pane,
        )}
    </>
  );
}
