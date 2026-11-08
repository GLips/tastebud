/**
 * Deciding from the derivation page. The owner can change their mind from any status but superseded:
 * accept (its scope optionally amended first) unless it is already accepted, reject anything not
 * rejected, retract what is accepted, and move an accepted one to a new scope in place.
 * `useDerivationReview` holds the state; `derivation-status.tsx` places the buttons and panels.
 */
import { Alert, Button, Group, Kbd, Tooltip } from "@mantine/core";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { describeScopeChange, isCompleteScope, isSameScope, type ScopeDraft } from "@tastebud/core/places";
import type { DerivationView } from "@tastebud/core/record-views";
import { Check, SquarePen, Undo2, X } from "lucide-react";
import { useState } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";

import { AcceptancePreview } from "./acceptance-preview.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { scopeButtonPhrase, scopeOverrideOf } from "./scope-draft.ts";
import { ScopeEditor } from "./scope-editor.tsx";
import { useReviewDecision } from "./use-review-decision.ts";

/** What an accept from each decided status changes, for the preview to say before it is sent. */
const ACCEPT_CONSEQUENCES: Partial<Record<DerivationView["status"], string>> = {
  accepted: "It stays accepted. From now on it applies only where shown above.",
  rejected: "It becomes accepted and applies where shown above. Your rejection stays in the history.",
  retracted: "It becomes accepted again and applies where shown above.",
};

type DerivationReviewMode = "idle" | "rejecting" | "editing" | "previewing";

export function useDerivationReview(view: DerivationView) {
  const lastAccept = view.decisions.findLast((entry) => entry.outcome === "accept");
  const decision = useReviewDecision(view.id, { ...view, acknowledges: lastAccept?.acknowledges });
  const [mode, setModeState] = useState<DerivationReviewMode>("idle");
  const [draft, setDraft] = useState<ScopeDraft | undefined>(undefined);
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(() => new Set());
  const [conflict, setConflict] = useState(false);
  // Kept here, not in the form, so closing the reject box keeps what was typed.
  const [rejectDraft, setRejectDraft] = useState("");
  const accepted = view.status === "accepted";
  // Pending: the draft amends the proposed scope. Decided: it starts from where it applies, or applied.
  const baseScope = view.status === "pending" ? view.proposedScope : view.effectiveScope;
  const shownScope = draft ?? baseScope;
  const setMode = (next: DerivationReviewMode) => {
    setConflict(false);
    setModeState(next);
  };
  // Acknowledgements belong to the scope they were given for: any change unchecks every box.
  const changeDraft = (next: ScopeDraft | undefined) => {
    setAcknowledged(new Set());
    setDraft(next === undefined || isSameScope(baseScope, next) ? undefined : next);
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
    } else if (outcome.failure.tag === "WideningNeedsAcknowledgement") {
      setModeState("previewing");
      setConflict(true);
    }
  };
  /** An undo that lands on a new near repeat opens the preview to acknowledge it, like any accept. */
  const undo = async () => {
    const outcome = await decision.undo();
    if (outcome !== undefined && !outcome.ok && outcome.failure.tag === "WideningNeedsAcknowledgement") {
      setModeState("previewing");
      setConflict(true);
    }
  };
  /** Unchanged, the accept is sent at once; an amended scope goes through the preview, an unfinished one to the editor. */
  const startAccept = () => {
    if (!isCompleteScope(shownScope)) setMode("editing");
    else if (draft !== undefined) setMode("previewing");
    else void accept([]);
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
    rejectDraft,
    setRejectDraft,
    acknowledged,
    setAcknowledged,
    conflict,
  };
}

export type DerivationReview = ReturnType<typeof useDerivationReview>;

/** Whether any decision is open to the owner: not on a superseded one (its revision governs) or a retired kind. */
export const canDecideDerivation = (view: DerivationView): boolean => !view.retired && view.status !== "superseded";

function RejectButton({ review }: { review: DerivationReview }) {
  return (
    <Tooltip label="Say why it’s wrong; you can still accept it later" withArrow>
      <Button
        variant="default"
        leftSection={<X size={14} />}
        rightSection={<Kbd size="xs">R</Kbd>}
        onClick={() => review.setMode("rejecting")}
      >
        Reject
      </Button>
    </Tooltip>
  );
}

function EditScopeButton({ review, hint }: { review: DerivationReview; hint: string }) {
  return (
    <Tooltip label={hint} withArrow>
      <Button variant="default" leftSection={<SquarePen size={14} />} onClick={() => review.setMode("editing")}>
        Edit scope
      </Button>
    </Tooltip>
  );
}

/** Accept from pending, rejected or retracted. */
function AcceptButton({ review, label }: { review: DerivationReview; label: string }) {
  return (
    <Button
      leftSection={<Check size={14} />}
      rightSection={<Kbd size="xs">A</Kbd>}
      loading={review.decision.pending}
      onClick={review.startAccept}
    >
      {label}
    </Button>
  );
}

/**
 * The page's keys, matching the inbox card's: A accepts, R rejects, S edits the scope, Esc goes back.
 * Live only while no panel is open, so typing a reason or a place never decides anything.
 */
export function useDerivationPageHotkeys(review: DerivationReview, goBack: () => void) {
  const { view, mode } = review;
  const decidable = mode === "idle" && canDecideDerivation(view);
  useHotkeys([
    { hotkey: "A", callback: review.startAccept, options: { enabled: decidable && view.status !== "accepted" } },
    {
      hotkey: "R",
      callback: () => review.setMode("rejecting"),
      options: { enabled: decidable && view.status !== "rejected" },
    },
    { hotkey: "S", callback: () => review.setMode("editing"), options: { enabled: decidable } },
    // Escape fires in inputs by default; here it would go back the moment Esc closes the reject box.
    { hotkey: "Escape", callback: goBack, options: { enabled: mode === "idle", ignoreInputs: true } },
  ]);
}

export function DerivationActions({
  review,
  acceptLabel,
  known,
}: {
  review: DerivationReview;
  acceptLabel: string;
  known: KnownPlaces;
}) {
  const { view, mode, decision, draft, shownScope } = review;
  if (mode !== "idle" || !canDecideDerivation(view)) return null;
  // Named with its scope, so the click that sends it says where it will apply.
  const acceptWords = (afterwards = "") =>
    isCompleteScope(shownScope)
      ? `${acceptLabel} ${scopeButtonPhrase(shownScope, known.labelOf)}${afterwards}${draft === undefined ? "" : "…"}`
      : `${acceptLabel}${afterwards}…`;
  switch (view.status) {
    case "pending":
      return (
        <Group gap="xxs" wrap="nowrap">
          <RejectButton review={review} />
          <EditScopeButton review={review} hint="Change where it would apply before you decide" />
          <AcceptButton review={review} label={acceptWords()} />
        </Group>
      );
    case "accepted":
      return (
        <Group gap="xxs" wrap="nowrap">
          <EditScopeButton review={review} hint="Change where it applies; it stays accepted" />
          <RejectButton review={review} />
          <Tooltip label="Stop applying it; you can accept it again later" withArrow>
            <Button
              variant="default"
              leftSection={<Undo2 size={14} />}
              loading={decision.pending}
              onClick={() => void decision.decide({ outcome: "retract" })}
            >
              Retract
            </Button>
          </Tooltip>
        </Group>
      );
    case "rejected":
      return (
        <Group gap="xxs" wrap="nowrap">
          <EditScopeButton review={review} hint="Accept it with a different scope" />
          <AcceptButton review={review} label={acceptWords(" after all")} />
        </Group>
      );
    case "retracted":
      return (
        <Group gap="xxs" wrap="nowrap">
          <RejectButton review={review} />
          <EditScopeButton review={review} hint="Bring it back with a different scope" />
          <AcceptButton review={review} label={acceptWords(" again")} />
        </Group>
      );
    default:
      return null;
  }
}

/** The outcome alert and whichever panel the mode opened: reject form, scope editor or preview. */
export function DerivationReviewPanels({
  review,
  acceptLabel,
  known,
}: {
  review: DerivationReview;
  acceptLabel: string;
  known: KnownPlaces;
}) {
  const { view, accepted, mode, setMode, decision, draft, changeDraft, baseScope, shownScope, acknowledged } = review;
  const changes = describeScopeChange(baseScope, shownScope, known.labelOf);
  // Moving an accepted one is "Apply"; the kind's accept label would read as accepting it twice.
  const verb = accepted ? "Apply" : acceptLabel;

  const confirmReject = async (reason: string) => {
    if (decision.pending) return;
    const outcome = await decision.decide({ outcome: "reject", reason });
    if (outcome.ok) {
      setMode("idle");
      review.setRejectDraft("");
    }
  };

  return (
    <>
      {decision.failure !== undefined && decision.failure.tag !== "WideningNeedsAcknowledgement" && (
        <Alert color="red" variant="light" withCloseButton onClose={decision.clearFailure} title="Not decided">
          {decision.failure.sentence}
        </Alert>
      )}
      {mode === "rejecting" && (
        <RejectReasonForm
          initialReason={review.rejectDraft}
          onReasonChange={review.setRejectDraft}
          pending={decision.pending}
          onCancel={() => setMode("idle")}
          onSubmit={(reason) => void confirmReject(reason)}
        />
      )}
      {mode === "editing" && (
        <ScopeEditor
          proposed={baseScope}
          draft={shownScope}
          known={known}
          active
          requireChange={accepted}
          continueLabel={(scope) => `${verb} ${scopeButtonPhrase(scope, known.labelOf)}…`}
          onDraftChange={changeDraft}
          onClose={() => {
            setMode("idle");
            if (accepted) changeDraft(undefined);
          }}
          onContinue={() => setMode("previewing")}
        />
      )}
      {mode === "previewing" && (
        <AcceptancePreview
          target={view.id}
          statement={view.statement}
          override={scopeOverrideOf(view.proposedScope, shownScope)}
          proposedScope={view.proposedScope}
          changes={changes}
          verb={verb}
          consequence={ACCEPT_CONSEQUENCES[view.status]}
          active
          acknowledged={acknowledged}
          onAcknowledge={(matchId, checked) => {
            const next = new Set(acknowledged);
            if (checked) next.add(matchId);
            else next.delete(matchId);
            review.setAcknowledged(next);
          }}
          conflict={review.conflict}
          pending={decision.pending}
          labels={known.labels}
          onConfirm={(acknowledges) => void review.accept(acknowledges)}
          onBack={() => setMode(draft === undefined ? "idle" : "editing")}
        />
      )}
    </>
  );
}
