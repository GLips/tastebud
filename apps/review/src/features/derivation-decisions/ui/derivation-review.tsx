/**
 * Deciding from the derivation page. A pending derivation is accepted (its scope optionally amended
 * first) or rejected. An accepted one is retracted, or moved to a new scope in place: one decision,
 * through the same preview and acknowledgements as an accept.
 * `useDerivationReview` holds the state; the buttons sit in the header and the panels below the facts.
 */
import { Alert, Button, Group, Tooltip } from "@mantine/core";
import type { DerivationView } from "@tastebud/core/record-views";
import { Check, SquarePen, Undo2, X } from "lucide-react";
import { useState } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";

import { AcceptancePreview } from "./acceptance-preview.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import {
  describeScopeChange,
  isCompleteScope,
  isSameScope,
  type ScopeDraft,
  scopeButtonPhrase,
  scopeOverrideOf,
} from "./scope-draft.ts";
import { ScopeEditor } from "./scope-editor.tsx";
import { useReviewDecision } from "./use-review-decision.ts";

type DerivationReviewMode = "idle" | "rejecting" | "editing" | "previewing";

export function useDerivationReview(view: DerivationView) {
  const decision = useReviewDecision(view.id);
  const [mode, setModeState] = useState<DerivationReviewMode>("idle");
  const [draft, setDraft] = useState<ScopeDraft | undefined>(undefined);
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(() => new Set());
  const [conflict, setConflict] = useState(false);
  const accepted = view.status === "accepted";
  // Pending: the draft amends the proposed scope. Accepted: it starts from where it applies now.
  const baseScope = accepted ? view.effectiveScope : view.proposedScope;
  const setMode = (next: DerivationReviewMode) => {
    setConflict(false);
    setModeState(next);
  };
  // Acknowledgements belong to the scope they were given for: any change unchecks every box.
  const changeDraft = (next: ScopeDraft | undefined) => {
    setAcknowledged(new Set());
    setDraft(next === undefined || isSameScope(baseScope, next) ? undefined : next);
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
    acknowledged,
    setAcknowledged,
    conflict,
    setConflict,
  };
}

type DerivationReview = ReturnType<typeof useDerivationReview>;

export function DerivationActions({
  review,
  acceptLabel,
  known,
}: {
  review: DerivationReview;
  acceptLabel: string;
  known: KnownPlaces;
}) {
  const { view, mode, setMode, decision, draft } = review;
  if (mode !== "idle" || view.retired) return null;
  if (view.status === "pending") {
    const shown = draft ?? view.proposedScope;
    return (
      <Group gap="xxs" wrap="nowrap">
        <Button variant="default" leftSection={<X size={14} />} onClick={() => setMode("rejecting")}>
          Reject
        </Button>
        <Button variant="default" leftSection={<SquarePen size={14} />} onClick={() => setMode("editing")}>
          Edit scope
        </Button>
        <Button
          leftSection={<Check size={14} />}
          loading={decision.pending}
          onClick={() => setMode(isCompleteScope(shown) ? "previewing" : "editing")}
        >
          {isCompleteScope(shown) ? `${acceptLabel} ${scopeButtonPhrase(shown, known.labelOf)}…` : `${acceptLabel}…`}
        </Button>
      </Group>
    );
  }
  if (view.status === "accepted")
    return (
      <Group gap="xxs" wrap="nowrap">
        <Tooltip label="Change where it applies; it stays accepted" withArrow>
          <Button variant="default" leftSection={<SquarePen size={14} />} onClick={() => setMode("editing")}>
            Edit scope
          </Button>
        </Tooltip>
        <Tooltip label="Agents stop recalling it; its history stays" withArrow position="bottom-end">
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
  return null;
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
  const { view, accepted, mode, setMode, decision, draft, changeDraft, baseScope, acknowledged } = review;
  const shownDraft = draft ?? baseScope;
  // The decision's scope is always against the proposed one: no override means "as proposed".
  const override = scopeOverrideOf(view.proposedScope, draft);
  const changes = describeScopeChange(baseScope, shownDraft, known.labelOf);
  // Moving an accepted one is "Apply"; the kind's accept label would read as accepting it twice.
  const verb = accepted ? "Apply" : acceptLabel;

  const confirmReject = async (reason: string) => {
    if (decision.pending) return;
    const outcome = await decision.decide({ outcome: "reject", reason });
    if (outcome.ok) setMode("idle");
  };
  const confirmAccept = async (acknowledges: ReadonlyArray<string>) => {
    const outcome = await decision.decide({ outcome: "accept", ...override, acknowledges });
    if (outcome.ok) {
      setMode("idle");
      changeDraft(undefined);
    } else if (outcome.failure.tag === "WideningNeedsAcknowledgement") review.setConflict(true);
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
          pending={decision.pending}
          onCancel={() => setMode("idle")}
          onSubmit={(reason) => void confirmReject(reason)}
        />
      )}
      {mode === "editing" && (
        <ScopeEditor
          proposed={baseScope}
          draft={shownDraft}
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
          override={override}
          proposedScope={view.proposedScope}
          changes={changes}
          verb={verb}
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
          onConfirm={(acknowledges) => void confirmAccept(acknowledges)}
          onBack={() => setMode(draft === undefined ? "idle" : "editing")}
        />
      )}
    </>
  );
}
