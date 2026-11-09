/**
 * One pending proposal in the inbox: a compact row in the queue and, while selected, the detail pane
 * beside it where it is decided. The pane is portalled into the page's pane column, so the card keeps
 * its triage state (rejecting, previewing, its decision and Undo) whichever row is open. The scope
 * draft lives with the inbox so a bulk Believe can tell edited cards apart.
 */
import type { InboxCard } from "@tastebud/core/inbox";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { isCompleteScope, type ScopeDraft } from "@tastebud/core/places";
import { Clock, MessageSquare, PencilLine } from "lucide-react";
import type { Ref } from "react";
import { createPortal } from "react-dom";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import type { DerivationCaution } from "#review/shared/ui/caution-chip.tsx";
import { KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { SubjectChip } from "#review/shared/ui/subject-chip.tsx";
import { otherSubjectOf } from "#review/shared/ui/subject-label.tsx";

import { InboxDecidedRow, type InboxDecidedRowLatest } from "./inbox-decided-row.tsx";
import { InboxProposalPane } from "./inbox-proposal-pane.tsx";
import { InboxProposalRow, type InboxRowCheck, type InboxRowNote } from "./inbox-proposal-row.tsx";
import { type InboxBatch, type InboxCardHandle, useInboxCardTriage } from "./use-inbox-card-triage.ts";

/** What deserves reading before deciding, as a row shows it before the proposal is opened. */
const rowCautionsOf = (
  card: InboxCard,
  { edited, backlog }: { edited: boolean; backlog: boolean },
): ReadonlyArray<DerivationCaution> => {
  const view = card.derivation;
  const cautions: ReadonlyArray<DerivationCaution | false> = [
    !backlog && view.contradictingSources.length > 0 && "says-the-opposite",
    view.despite.length > 0 && "near-a-rejection",
    !edited && card.needsAcknowledgement.length > 0 && "near-a-repeat",
  ];
  return cautions.filter((caution) => caution !== false);
};

/** The row's neutral facts: queued in a bulk decision, its scope edited, its notes. */
const rowNotesOf = (card: InboxCard, { edited, queued }: { edited: boolean; queued: boolean }) => {
  const notes = card.derivation.thread.length;
  const facts: ReadonlyArray<InboxRowNote | false> = [
    queued && { icon: Clock, text: "Queued", tooltip: "Waiting its turn in a bulk decision" },
    edited && { icon: PencilLine, text: "Scope edited", tooltip: "You changed where it applies" },
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
    cardHandles,
    onDraftChange,
    onEngagedChange,
    onDecided,
    onUndone,
  });
  const view = card.derivation;
  const catalog = useReviewCatalog();

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
        glyph={<KindGlyph catalog={catalog} kind={view.kind} size={13} />}
        chips={{
          // The section is the proposed scope, so only an edit puts a different place on the row.
          scope: triage.edited && isCompleteScope(triage.shownScope) ? triage.shownScope : undefined,
          subject: otherSubjectOf(view, owner) === undefined ? null : <SubjectChip summary={view} owner={owner} />,
          cautions: rowCautionsOf(card, { edited: triage.edited, backlog: kind.recall === "never" }),
          notes: rowNotesOf(card, { edited: triage.edited, queued }),
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
