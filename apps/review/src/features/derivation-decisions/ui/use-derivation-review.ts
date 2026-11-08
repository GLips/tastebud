/**
 * The derivation page's decision state: the scope draft, which panel is open, the acknowledgements
 * an accept carries, and the decisions themselves. The owner can change their mind from any status
 * but superseded; `decisionInvalidReason` in core is the rule.
 */
import { isCompleteScope, isSameScope, type ScopeDraft } from "@tastebud/core/places";
import type { DerivationView } from "@tastebud/core/record-views";
import { useState } from "react";

import { scopeOverrideOf } from "./scope-draft.ts";
import { useReviewDecision } from "./use-review-decision.ts";

type DerivationReviewMode = "idle" | "rejecting" | "previewing";

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
  // Bumped by the S key: the picker remounts open. Its own open state is reported back for Esc.
  const [pickerRequest, setPickerRequest] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const accepted = view.status === "accepted";
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
  /** Unchanged, the accept is sent at once; a changed scope is previewed first. */
  const startAccept = () => {
    if (!isCompleteScope(shownScope)) return;
    if (draft === undefined) void accept([]);
    else setMode("previewing");
  };
  /** An undo that lands on a new near repeat opens the preview to acknowledge it, like any accept. */
  const undo = async () => {
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
    startAccept,
    undo,
    reject,
    reopen,
    retract: () => void decision.decide({ outcome: "retract" }),
    rejectDraft,
    setRejectDraft,
    acknowledged,
    setAcknowledged,
    conflict,
    pickerRequest,
    openPicker: () => setPickerRequest((count) => count + 1),
    pickerOpen,
    setPickerOpen,
  };
}

export type DerivationReview = ReturnType<typeof useDerivationReview>;
