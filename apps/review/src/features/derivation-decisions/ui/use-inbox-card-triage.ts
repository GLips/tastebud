/**
 * What one inbox card is in the middle of: rejecting, previewing an accept, the picker open, a decision
 * in flight, and the decision with its Undo once made. It lives with the card, not the pane, so it
 * survives the reviewer opening another row and coming back.
 */
import { useQueryClient } from "@tanstack/react-query";
import type { InboxCard } from "@tastebud/core/inbox";
import {
  describeScopeChange,
  isCompleteScope,
  isSameScope,
  isScopeNarrowing,
  type ScopeDraft,
} from "@tastebud/core/places";
import { useEffect, useState } from "react";

import { recordDetailQuery } from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { acceptPreviewsStaleOf } from "#review/shared/query-keys.ts";
import { refreshReviewQueriesAfterWrite } from "#review/shared/refresh-after-write.ts";

import { scopeOverrideOf } from "./scope-draft.ts";
import { type ReviewDecisionInput, useReviewDecision } from "./use-review-decision.ts";

export type InboxCardMode = "idle" | "rejecting" | "previewing";

/** A batch: the ids one bulk decision decided together, so they are undone together. */
export type InboxBatch = ReadonlyArray<string>;

/** What the page can ask of a mounted card, so a bulk decision and its Undo all go through each card. */
export type InboxCardHandle = {
  /** Each resolves to the refusal sentence, or undefined once it landed. */
  acceptAsProposed: (batch: InboxBatch) => Promise<string | undefined>;
  rejectWithReason: (reason: string, batch: InboxBatch) => Promise<string | undefined>;
  undo: () => Promise<void>;
};

export function useInboxCardTriage({
  card,
  draft,
  known,
  selected,
  queued,
  selectionHoldsKeys,
  cardHandles,
  onDraftChange,
  onEngagedChange,
  onDecided,
  onUndone,
}: {
  card: InboxCard;
  draft: ScopeDraft | undefined;
  known: KnownPlaces;
  selected: boolean;
  queued: boolean;
  /** Rows are checked, so a and r act on them through the selection bar, not on this card. */
  selectionHoldsKeys: boolean;
  cardHandles: Map<string, InboxCardHandle>;
  onDraftChange: (draft: ScopeDraft | undefined) => void;
  onEngagedChange: (engaged: boolean) => void;
  onDecided: (batch: InboxBatch | undefined) => void;
  onUndone: () => void;
}) {
  const view = card.derivation;
  const decision = useReviewDecision(view.id, {
    ...view,
    acknowledges: view.decisions.findLast((entry) => entry.outcome === "accept")?.acknowledges,
  });
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<InboxCardMode>("idle");
  const [conflict, setConflict] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  // The picker lives in the pane, so it closes with the card's selection rather than staying open unseen.
  if (pickerOpen && !selected) setPickerOpen(false);

  const proposed = view.proposedScope;
  const shownScope = draft ?? proposed;
  const edited = draft !== undefined && !isSameScope(proposed, draft);
  const override = scopeOverrideOf(proposed, draft);
  const changes = describeScopeChange(proposed, shownScope, known.labelOf);
  // A conflict always previews; an edit previews only when it reaches somewhere the agent didn't propose.
  const needsPreview =
    card.needsAcknowledgement.length > 0 || (edited && !(isCompleteScope(draft) && isScopeNarrowing(proposed, draft)));
  const engaged = mode !== "idle" || decision.pending || pickerOpen;

  useEffect(() => {
    onEngagedChange(engaged);
    return () => onEngagedChange(false);
  }, [engaged, onEngagedChange]);

  const changeDraft = (next: ScopeDraft | undefined) => {
    onDraftChange(next === undefined || isSameScope(proposed, next) ? undefined : next);
  };
  // Back to idle with nothing half-typed, so an Undo returns a clean card.
  const settleDecided = (batch: InboxBatch | undefined) => {
    setMode("idle");
    setRejectReason("");
    onDecided(batch);
  };

  const decideInBatch = async (input: ReviewDecisionInput, batch: InboxBatch) => {
    const outcome = await decision.decide(input);
    if (!outcome.ok) return outcome.failure.sentence;
    settleDecided(batch);
    return undefined;
  };
  const undo = async () => {
    const outcome = await decision.undo();
    if (outcome?.ok) onUndone();
  };
  // A batch's Undo all makes the same check as a row's own Undo, read fresh: a card decided again
  // since, in another tab or by an agent, keeps that newer decision.
  const undoIfStillLatest = async () => {
    const { undoable } = decision;
    if (undoable === undefined) return;
    const detail = await queryClient.fetchQuery(recordDetailQuery(view.id));
    if (detail.derivation?.decisions.at(-1)?.id === undoable.decisionId) await undo();
  };
  // Re-registered every render so a batch always calls the card as it now is.
  useEffect(() => {
    cardHandles.set(view.id, {
      acceptAsProposed: (batch) => decideInBatch({ outcome: "accept" }, batch),
      rejectWithReason: (reason, batch) => decideInBatch({ outcome: "reject", reason }, batch),
      undo: undoIfStillLatest,
    });
    return () => void cardHandles.delete(view.id);
  });

  const submitAccept = async (acknowledges: ReadonlyArray<string>) => {
    if (decision.pending) return;
    const outcome = await decision.decide({ outcome: "accept", ...override, acknowledges });
    if (outcome.ok) return settleDecided(undefined);
    if (outcome.failure.tag !== "WideningNeedsAcknowledgement") return;
    setConflict(true);
    setMode("previewing");
    await refreshReviewQueriesAfterWrite(queryClient, acceptPreviewsStaleOf(view.id));
  };
  const submitReject = async (reason: string) => {
    if (decision.pending) return;
    const outcome = await decision.decide({ outcome: "reject", reason });
    if (outcome.ok) settleDecided(undefined);
  };
  const accept = () => {
    if (decision.pending || queued) return;
    setPickerOpen(false);
    if (!needsPreview) return void submitAccept([]);
    setConflict(false);
    setMode("previewing");
  };

  return {
    decision,
    mode,
    setMode,
    conflict,
    rejectReason,
    setRejectReason,
    pickerOpen,
    setPickerOpen,
    proposed,
    shownScope,
    edited,
    override,
    changes,
    needsPreview,
    engaged,
    selectionHoldsKeys,
    changeDraft,
    accept,
    startReject: () => setMode("rejecting"),
    submitAccept,
    submitReject,
    undo,
  };
}

export type InboxCardTriage = ReturnType<typeof useInboxCardTriage>;
