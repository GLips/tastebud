/**
 * One pending proposal in the inbox: a compact row in the queue and, while selected, the detail pane
 * beside it where it is decided. The pane is portalled into the page's pane column, so the card keeps
 * its triage state (rejecting, previewing, its decision and Undo) whichever row is open. The scope
 * draft lives with the inbox so a bulk Believe can tell edited cards apart.
 */
import type { InboxCard } from "@tastebud/core/inbox";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { isCompleteScope, type ScopeDraft } from "@tastebud/core/places";
import { Ban, Clock, CopyCheck, MessageSquare, PencilLine, Contrast } from "lucide-react";
import type { Ref } from "react";
import { createPortal } from "react-dom";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { SubjectChip } from "#review/shared/ui/subject-chip.tsx";

import { InboxDecidedRow, type InboxDecidedRowLatest } from "./inbox-decided-row.tsx";
import { InboxProposalPane } from "./inbox-proposal-pane.tsx";
import { InboxProposalRow, type InboxRowCheck, type InboxRowFlag } from "./inbox-proposal-row.tsx";
import { type InboxBatch, type InboxCardHandle, useInboxCardTriage } from "./use-inbox-card-triage.ts";

/** What a row flags about a proposal before it is opened; the pane shows each in full. */
const rowFlagsOf = (
  card: InboxCard,
  { edited, queued, backlog }: { edited: boolean; queued: boolean; backlog: boolean },
): ReadonlyArray<InboxRowFlag> => {
  const view = card.derivation;
  const notes = view.thread.length;
  const flags: ReadonlyArray<InboxRowFlag | false> = [
    queued && { icon: Clock, text: "Queued", tooltip: "Waiting its turn in a bulk decision", caution: false },
    edited && { icon: PencilLine, text: "Scope edited", tooltip: "You changed where it applies", caution: false },
    !backlog &&
      view.contradictingSources.length > 0 && {
        icon: Contrast,
        text: "Says the opposite",
        tooltip: "One of its sources says the opposite",
        caution: true,
      },
    view.despite.length > 0 && {
      icon: Ban,
      text: "Near a rejection",
      tooltip: "Close to something you rejected",
      caution: true,
    },
    !edited &&
      card.needsAcknowledgement.length > 0 && {
        icon: CopyCheck,
        text: "Near repeat",
        tooltip: "Overlaps a near repeat already decided",
        caution: true,
      },
    notes > 0 && {
      icon: MessageSquare,
      text: String(notes),
      tooltip: notes === 1 ? "1 note in its thread" : `${notes} notes in its thread`,
      caution: false,
    },
  ];
  return flags.filter((flag) => flag !== false);
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
        scope={isCompleteScope(triage.shownScope) ? triage.shownScope : undefined}
        subject={<SubjectChip summary={view} owner={owner} />}
        flags={rowFlagsOf(card, { edited: triage.edited, queued, backlog: kind.recall === "never" })}
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
