/**
 * The derivation page's decision state: the scope draft, which panel is open, the acknowledgements
 * an accept carries, and the decisions themselves. The owner can change their mind from any status
 * but superseded; `decisionInvalidReason` in core is the rule.
 */
import { isCompleteScope, isSameScope, isScopeNarrowing, type ScopeDraft } from "@tastebud/core/places";
import type { DerivationView } from "@tastebud/core/record-views";
import { useEffect, useRef, useState } from "react";

import { scopeOverrideOf } from "./scope-draft.ts";
import { useReviewDecision } from "./use-review-decision.ts";

type DerivationReviewMode = "idle" | "rejecting" | "previewing";

const DECISION_SETTLE_MS = 400;

/** Whether any decision is open to the owner: not on a superseded one (its revision governs) or a retired kind. */
export const canDecideDerivation = (view: DerivationView): boolean => !view.retired && view.status !== "superseded";

export function useDerivationReview(view: DerivationView) {
  const lastAccept = view.decisions.findLast((entry) => entry.outcome === "accept");
  const decision = useReviewDecision(view.id, { ...view, acknowledges: lastAccept?.acknowledges });
  const [mode, setModeState] = useState<DerivationReviewMode>("idle");
  const [draft, setDraft] = useState<ScopeDraft | undefined>(undefined);
  const [acknowledgedChoice, setAcknowledged] = useState<ReadonlySet<string> | undefined>(undefined);
  const [conflict, setConflict] = useState(false);
  // Kept here, not in the form, so closing the reject box keeps what was typed.
  const [rejectDraft, setRejectDraft] = useState("");
  // The picker's list, held here so the S key can open it and the page's Esc can wait for it.
  const [pickerOpen, setPickerOpen] = useState(false);
  const accepted = view.status === "accepted";
  // Undo only while the decision made here is still the latest one on record.
  const undoable =
    decision.undoable !== undefined && view.decisions.at(-1)?.id === decision.undoable.decisionId
      ? decision.undoable
      : undefined;
  /*
   * A decision swaps the buttons under the cursor (Accept becomes Retract), so the second click of a
   * double-click would decide again. Clicks and keys within a moment of a decision settling are dropped.
   */
  const settledAt = useRef(0);
  useEffect(() => {
    if (!decision.pending) settledAt.current = Date.now();
  }, [decision.pending]);
  const steady =
    <Args extends ReadonlyArray<unknown>>(act: (...args: Args) => void) =>
    (...args: Args) => {
      if (Date.now() - settledAt.current >= DECISION_SETTLE_MS) act(...args);
    };
  // Pending: the draft amends the proposed scope. Decided: it starts from where it applies, or applied.
  const baseScope = view.status === "pending" ? view.proposedScope : view.effectiveScope;
  const shownScope = draft ?? baseScope;
  // Re-accepting where it already applied starts with the near repeats its last accept weighed ticked.
  const acknowledged =
    acknowledgedChoice ??
    new Set(draft === undefined && view.status !== "pending" ? (lastAccept?.acknowledges ?? []) : []);
  const setMode = (next: DerivationReviewMode) => {
    setConflict(false);
    setModeState(next);
  };
  // Acknowledgements belong to the scope they were given for: any change resets every box.
  const changeDraft = (next: ScopeDraft | undefined) => {
    setAcknowledged(undefined);
    setDraft(next === undefined || isSameScope(baseScope, next) ? undefined : next);
  };
  const openConflict = () => {
    setModeState("previewing");
    setConflict(true);
  };
  /**
   * Sends the accept. The server re-runs the near-repeat check, so an accept sent straight from a
   * button lands in one click when nothing overlaps, and opens the preview when something does.
   */
  const accept = async (acknowledges: ReadonlyArray<string>) => {
    // The decision's scope is always against the proposed one: no override means "as proposed".
    const outcome = await decision.decide({
      outcome: "accept",
      ...scopeOverrideOf(view.proposedScope, shownScope),
      acknowledges,
    });
    if (outcome.ok) {
      setMode("idle");
      changeDraft(undefined);
    } else if (outcome.failure.tag === "WideningNeedsAcknowledgement") openConflict();
  };
  // Unchanged or only narrowed, an accept can't newly overlap anything, so it goes in one click.
  const needsPreview = draft !== undefined && isCompleteScope(draft) && !isScopeNarrowing(baseScope, draft);
  const startAccept = () => {
    if (!isCompleteScope(shownScope)) return;
    if (needsPreview) setMode("previewing");
    else void accept([]);
  };
  /** An undo that lands on a new near repeat opens the preview to acknowledge it, like any accept. */
  const undo = async () => {
    if (undoable === undefined) return;
    const outcome = await decision.undo();
    if (outcome !== undefined && !outcome.ok && outcome.failure.tag === "WideningNeedsAcknowledgement") openConflict();
  };
  const reject = async (reason: string) => {
    if (decision.pending) return;
    const outcome = await decision.decide({ outcome: "reject", reason });
    if (outcome.ok) {
      setMode("idle");
      setRejectDraft("");
    }
  };
  const reopen = () => {
    changeDraft(undefined);
    void decision.decide({ outcome: "reopen" });
  };
  return {
    view,
    accepted,
    mode,
    setMode,
    decision,
    draft,
    changeDraft,
    baseScope,
    shownScope,
    accept,
    startAccept: steady(startAccept),
    needsPreview,
    undoable,
    undo: steady(() => void undo()),
    reject,
    reopen: steady(reopen),
    retract: steady(() => void decision.decide({ outcome: "retract" })),
    startReject: steady(() => setMode("rejecting")),
    rejectDraft,
    setRejectDraft,
    acknowledged,
    setAcknowledged,
    conflict,
    openPicker: () => setPickerOpen(true),
    pickerOpen,
    setPickerOpen,
  };
}

export type DerivationReview = ReturnType<typeof useDerivationReview>;
