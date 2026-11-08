/**
 * The derivation page's decision controls: the actions that fit its status, the scope picker the
 * primary button follows, and whichever panel is open (reject reason or acceptance preview).
 * State lives in `use-derivation-review.ts`; `derivation-status.tsx` places these in the card.
 */
import { Alert, Anchor, Button, Group, Kbd, Text, Tooltip } from "@mantine/core";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { describeScopeChange, isCompleteScope } from "@tastebud/core/places";
import type { DerivationView } from "@tastebud/core/record-views";
import { Check, Inbox, Undo2, X } from "lucide-react";

import type { KnownPlaces } from "#review/shared/known-places.ts";

import { AcceptancePreview } from "./acceptance-preview.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { scopeButtonPhrase, scopeOverrideOf } from "./scope-draft.ts";
import { ScopePicker } from "./scope-picker.tsx";
import { canDecideDerivation, type DerivationReview } from "./use-derivation-review.ts";

/** What an accept from each decided status changes, for the preview to say before it is sent. */
const ACCEPT_CONSEQUENCES: Partial<Record<DerivationView["status"], string>> = {
  accepted: "It stays accepted. From now on it applies only where shown above.",
  rejected: "It becomes accepted and applies where shown above. Your rejection stays in the history.",
  retracted: "It becomes accepted again and applies where shown above.",
};

/** The scope row's label, read with the status: only an accepted one applies anywhere right now. */
const SCOPE_ROW_LABELS: Record<DerivationView["status"], string> = {
  pending: "Proposed for",
  accepted: "Applies in",
  rejected: "Accept for",
  retracted: "Accept for",
  superseded: "Applied in",
};

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

function ReopenButton({ review }: { review: DerivationReview }) {
  return (
    <Tooltip label="Undecided again: it waits in the inbox with the other proposals" withArrow>
      <Button
        variant="subtle"
        color="gray"
        leftSection={<Inbox size={14} />}
        loading={review.decision.pending}
        onClick={review.reopen}
      >
        Put back in the inbox
      </Button>
    </Tooltip>
  );
}

/** Accept, named with where it will apply; a changed scope ends in "…" because the preview comes first. */
function AcceptButton({
  review,
  acceptLabel,
  afterwards,
  known,
}: {
  review: DerivationReview;
  acceptLabel: string;
  afterwards: string;
  known: KnownPlaces;
}) {
  const { shownScope, draft } = review;
  const complete = isCompleteScope(shownScope);
  // Moving an accepted one is "Apply"; the kind's accept label would read as accepting it twice.
  const verb = review.accepted ? "Apply" : acceptLabel;
  const where = complete ? ` ${scopeButtonPhrase(shownScope, known.labelOf)}` : "";
  return (
    <Button
      leftSection={<Check size={14} />}
      rightSection={review.accepted ? undefined : <Kbd size="xs">A</Kbd>}
      loading={review.decision.pending}
      disabled={!complete}
      onClick={review.startAccept}
    >
      {`${verb}${where}${afterwards}${draft === undefined ? "" : "…"}`}
    </Button>
  );
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
  const { view, mode, draft } = review;
  if (mode !== "idle" || !canDecideDerivation(view)) return null;
  const accept = (afterwards: string) => (
    <AcceptButton review={review} acceptLabel={acceptLabel} afterwards={afterwards} known={known} />
  );
  switch (view.status) {
    case "pending":
      return (
        <Group gap="xxs" wrap="nowrap">
          <RejectButton review={review} />
          {accept("")}
        </Group>
      );
    case "accepted":
      return (
        <Group gap="xxs" wrap="nowrap">
          <ReopenButton review={review} />
          <RejectButton review={review} />
          <Tooltip label="Stop applying it; you can accept it again later" withArrow>
            <Button
              variant="default"
              leftSection={<Undo2 size={14} />}
              loading={review.decision.pending}
              onClick={review.retract}
            >
              Retract
            </Button>
          </Tooltip>
          {draft !== undefined && accept("")}
        </Group>
      );
    case "rejected":
      return (
        <Group gap="xxs" wrap="nowrap">
          <ReopenButton review={review} />
          {accept(" after all")}
        </Group>
      );
    case "retracted":
      return (
        <Group gap="xxs" wrap="nowrap">
          <ReopenButton review={review} />
          <RejectButton review={review} />
          {accept(" again")}
        </Group>
      );
    default:
      return null;
  }
}

/**
 * Where it applies, as the picker: one click opens it, and the accept button follows the draft. An
 * accepted one keeps applying where it does until "Apply" is pressed.
 */
export function DerivationScopeRow({ review, known }: { review: DerivationReview; known: KnownPlaces }) {
  const { view, draft, shownScope, baseScope } = review;
  const restoreWords = view.status === "pending" ? "Restore proposed scope" : "Restore previous scope";
  return (
    <Group gap="xs" wrap="wrap">
      <Text size="xs" c="dimmed">
        {SCOPE_ROW_LABELS[view.status]}
      </Text>
      <ScopePicker
        // Remounted open by the S key.
        key={review.pickerRequest}
        defaultOpened={review.pickerRequest > 0}
        value={shownScope}
        proposed={view.proposedScope}
        known={known}
        onChange={review.changeDraft}
        onOpenedChange={review.setPickerOpen}
        disabled={review.mode !== "idle" || review.decision.pending}
      />
      {draft !== undefined && (
        <>
          <Text size="xs" c="dimmed">
            {describeScopeChange(baseScope, shownScope, known.labelOf).join(" · ")}
          </Text>
          <Anchor component="button" size="xs" c="dimmed" onClick={() => review.changeDraft(undefined)}>
            {restoreWords}
          </Anchor>
        </>
      )}
    </Group>
  );
}

/**
 * The page's keys, matching the inbox card's: A accepts, R rejects, S opens the scope picker, Esc drops
 * a changed scope first and otherwise goes back. Live only while no panel or list is open, so typing a reason or a place never decides anything.
 */
export function useDerivationPageHotkeys(review: DerivationReview, goBack: () => void) {
  const { view, mode, pickerOpen } = review;
  const idle = mode === "idle" && !pickerOpen;
  const decidable = idle && canDecideDerivation(view);
  useHotkeys([
    { hotkey: "A", callback: review.startAccept, options: { enabled: decidable && view.status !== "accepted" } },
    {
      hotkey: "R",
      callback: () => review.setMode("rejecting"),
      options: { enabled: decidable && view.status !== "rejected" },
    },
    { hotkey: "S", callback: review.openPicker, options: { enabled: decidable } },
    // Escape fires in inputs by default; here it would go back the moment Esc closes the reject box.
    {
      hotkey: "Escape",
      callback: () => (review.draft === undefined ? goBack() : review.changeDraft(undefined)),
      options: { enabled: idle, ignoreInputs: true },
    },
  ]);
}

/** The outcome alert and whichever panel the mode opened: the reject reason or the acceptance preview. */
export function DerivationReviewPanels({
  review,
  acceptLabel,
  known,
}: {
  review: DerivationReview;
  acceptLabel: string;
  known: KnownPlaces;
}) {
  const { view, accepted, mode, setMode, decision, baseScope, shownScope, acknowledged } = review;
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
          onSubmit={(reason) => void review.reject(reason)}
        />
      )}
      {mode === "previewing" && (
        <AcceptancePreview
          target={view.id}
          statement={view.statement}
          override={scopeOverrideOf(view.proposedScope, shownScope)}
          proposedScope={view.proposedScope}
          changes={describeScopeChange(baseScope, shownScope, known.labelOf)}
          verb={accepted ? "Apply" : acceptLabel}
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
          onBack={() => setMode("idle")}
        />
      )}
    </>
  );
}
