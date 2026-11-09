/**
 * The derivation page's decision controls: the actions that fit its status, the scope picker the
 * primary button follows, and whichever panel is open (reject reason or acceptance preview).
 * State lives in `use-derivation-review.ts`; `derivation-status.tsx` places these in the card.
 */
import { Alert, Anchor, Button, Group, Kbd, Stack, Text, Tooltip } from "@mantine/core";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { describeScopeChange, isCompleteScope, isSameScope } from "@tastebud/core/places";
import type { DerivationView } from "@tastebud/core/record-views";
import { Check, Inbox, Undo2, X } from "lucide-react";

import type { KnownPlaces } from "#review/shared/known-places.ts";

import { acceptInLabel, acceptItPhrase } from "./accept-wording.ts";
import { AcceptancePreview } from "./acceptance-preview.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { scopeOverrideOf } from "./scope-draft.ts";
import { ScopePicker } from "./scope-picker.tsx";
import { canDecideDerivation, type DerivationReview } from "./use-derivation-review.ts";

/** What an accept from each decided status changes, for the preview to say before it is sent. */
const ACCEPT_CONSEQUENCES: Partial<Record<DerivationView["status"], string>> = {
  accepted: "It stays accepted. From now on it applies only where shown above.",
  rejected: "It becomes accepted and applies where shown above. Your rejection stays in the history.",
  retracted: "It becomes accepted again and applies where shown above.",
};

/** The scope row's label: where an accepted one applies, or the action the accept button takes. */
const scopeRowLabelOf = (status: DerivationView["status"], acceptLabel: string): string => {
  if (status === "accepted") return "Applies in";
  if (status === "superseded") return "Applied in";
  return acceptInLabel(acceptLabel);
};

function RejectButton({ review, acceptLabel }: { review: DerivationReview; acceptLabel: string }) {
  return (
    <Tooltip label={`Say why it’s wrong; you can still ${acceptItPhrase(acceptLabel)} later`} withArrow>
      <Button
        variant="default"
        leftSection={<X size={14} />}
        rightSection={<Kbd size="xs">R</Kbd>}
        onClick={review.startReject}
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

/**
 * The kind's accept verb, kept short: the picker beside it says where. It ends in "…" when the
 * preview comes first (a widened scope).
 */
function AcceptButton({ review, acceptLabel }: { review: DerivationReview; acceptLabel: string }) {
  return (
    <Button
      leftSection={<Check size={14} />}
      rightSection={<Kbd size="xs">A</Kbd>}
      loading={review.decision.pending}
      disabled={!isCompleteScope(review.shownScope)}
      onClick={review.startAccept}
    >
      {`${acceptLabel}${review.needsPreview ? "…" : ""}`}
    </Button>
  );
}

function RetractButton({ review, acceptLabel }: { review: DerivationReview; acceptLabel: string }) {
  return (
    <Tooltip label={`Stop applying it; you can ${acceptItPhrase(acceptLabel)} again later`} withArrow>
      <Button
        variant="default"
        leftSection={<Undo2 size={14} />}
        loading={review.decision.pending}
        onClick={review.retract}
      >
        Retract
      </Button>
    </Tooltip>
  );
}

/** The verbs that fit its status, in the pending page's words. An accepted one shows the accept verb only for a new scope. */
export function DerivationActions({ review, acceptLabel }: { review: DerivationReview; acceptLabel: string }) {
  const { view, mode, draft } = review;
  if (mode !== "idle" || !canDecideDerivation(view)) return null;
  const accept = <AcceptButton review={review} acceptLabel={acceptLabel} />;
  switch (view.status) {
    case "pending":
      return (
        <Group gap="xxs" wrap="nowrap">
          <RejectButton review={review} acceptLabel={acceptLabel} />
          {accept}
        </Group>
      );
    case "accepted":
      return (
        <Group gap="xxs" wrap="nowrap">
          <ReopenButton review={review} />
          <RejectButton review={review} acceptLabel={acceptLabel} />
          <RetractButton review={review} acceptLabel={acceptLabel} />
          {draft !== undefined && accept}
        </Group>
      );
    case "rejected":
      return (
        <Group gap="xxs" wrap="nowrap">
          <ReopenButton review={review} />
          {accept}
        </Group>
      );
    case "retracted":
      return (
        <Group gap="xxs" wrap="nowrap">
          <ReopenButton review={review} />
          <RejectButton review={review} acceptLabel={acceptLabel} />
          {accept}
        </Group>
      );
    default:
      return null;
  }
}

/**
 * Where it applies, as the picker: one click opens it, and the accept button follows the draft. An
 * accepted one keeps applying where it does until the accept verb is pressed.
 */
export function DerivationScopeRow({
  review,
  acceptLabel,
  known,
}: {
  review: DerivationReview;
  acceptLabel: string;
  known: KnownPlaces;
}) {
  const { view, draft, shownScope, baseScope } = review;
  const restoreWords = view.status === "pending" ? "Restore proposed scope" : "Restore previous scope";
  return (
    <Stack gap="3xs">
      <Group gap="xs" wrap="wrap">
        <Text size="xs" c="dimmed">
          {scopeRowLabelOf(view.status, acceptLabel)}
        </Text>
        <ScopePicker
          opened={review.pickerOpen}
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
      {draft === undefined && <ScopeProvenance view={view} known={known} />}
    </Stack>
  );
}

/** Where the shown scope came from, when that isn't simply "the agent proposed it". */
function ScopeProvenance({ view, known }: { view: DerivationView; known: KnownPlaces }) {
  const note =
    view.status === "pending"
      ? view.scopeSource === "defaulted" && "Guessed from where the agent was working"
      : !isSameScope(view.proposedScope, view.effectiveScope) &&
        `You changed what the agent proposed: ${describeScopeChange(view.proposedScope, view.effectiveScope, known.labelOf).join(" · ")}`;
  if (note === false) return null;
  return (
    <Text size="xs" c="dimmed">
      {note}
    </Text>
  );
}

/**
 * The page's keys, matching the inbox card's: A accepts, R rejects, S opens the scope picker, U undoes
 * the decision just made here, Esc drops a changed scope and otherwise goes back. Letters never fire from
 * a text field (the library's default), and none fire while a panel or list is open.
 */
export function useDerivationPageHotkeys(review: DerivationReview, goBack: () => void) {
  const { view, mode, pickerOpen } = review;
  const idle = mode === "idle" && !pickerOpen;
  const decidable = idle && canDecideDerivation(view);
  useHotkeys([
    { hotkey: "A", callback: review.startAccept, options: { enabled: decidable && view.status !== "accepted" } },
    {
      hotkey: "R",
      callback: review.startReject,
      options: { enabled: decidable && view.status !== "rejected" },
    },
    { hotkey: "S", callback: review.openPicker, options: { enabled: decidable } },
    { hotkey: "U", callback: review.undo, options: { enabled: idle && review.undoable !== undefined } },
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
  const { view, mode, setMode, decision, baseScope, shownScope } = review;
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
          verb={acceptLabel}
          consequence={ACCEPT_CONSEQUENCES[view.status]}
          active
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
