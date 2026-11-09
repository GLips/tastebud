/**
 * The derivation's decision controls: the actions that fit its status (at the foot of the state card),
 * the Scope property the accept follows, and whichever panel is open (reject reason or acceptance
 * preview). State lives in `use-derivation-review.ts`. Hotkeys live in tooltips, never in the buttons.
 */
import { ActionIcon, Alert, Button, Group, Menu, Stack, Tooltip } from "@mantine/core";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { describeScopeChange, isCompleteScope } from "@tastebud/core/places";
import type { DerivationView } from "@tastebud/core/record-views";
import { Check, Ellipsis, Inbox, PencilLine, Undo2, X } from "lucide-react";
import type { MouseEventHandler } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";

import { acceptItPhrase } from "./accept-wording.ts";
import { AcceptancePreview } from "./acceptance-preview.tsx";
import { ignoringRepeatClicks } from "./inbox-decided-row.tsx";
import { scopeOverrideOf } from "./scope-draft.ts";
import { ScopePropertyField } from "./scope-picker.tsx";
import { canDecideDerivation, type DerivationReview } from "./use-derivation-review.ts";

/** What an accept from each decided status changes, for the preview to say before it is sent. */
const ACCEPT_CONSEQUENCES: Partial<Record<DerivationView["status"], string>> = {
  accepted: "It stays accepted. From now on it applies only where shown above.",
  rejected: "It becomes accepted and applies where shown above. Your rejection stays in the history.",
  retracted: "It becomes accepted again and applies where shown above.",
};

/**
 * Reject beside the filled accept verb: a waiting proposal's two answers. The page and the inbox pane
 * both use it. The verb ends in "…" when the preview comes first (a widened scope or a near repeat).
 */
export function PendingDecisionButtons({
  acceptLabel,
  needsPreview,
  pending,
  acceptDisabled = false,
  onAccept,
  onReject,
  stacked = false,
}: {
  acceptLabel: string;
  needsPreview: boolean;
  pending: boolean;
  acceptDisabled?: boolean;
  onAccept: MouseEventHandler<HTMLButtonElement>;
  onReject: MouseEventHandler<HTMLButtonElement>;
  /** The state card stacks them full width, Believe on top; the pane's head sets them in a row. */
  stacked?: boolean;
}) {
  const reject = (
    <Tooltip label="Reject with a reason · R" withArrow>
      <Button variant="default" fullWidth={stacked} leftSection={<X size={14} />} onClick={onReject}>
        Reject
      </Button>
    </Tooltip>
  );
  const accept = (
    <Tooltip label={needsPreview ? `Review, then ${acceptLabel.toLowerCase()} · A` : `${acceptLabel} · A`} withArrow>
      <Button
        fullWidth={stacked}
        leftSection={<Check size={14} />}
        loading={pending}
        disabled={acceptDisabled}
        onClick={onAccept}
      >
        {`${acceptLabel}${needsPreview ? "…" : ""}`}
      </Button>
    </Tooltip>
  );
  return stacked ? (
    <Stack gap="xs">
      {accept}
      {reject}
    </Stack>
  ) : (
    <Group gap="xs" wrap="nowrap">
      {reject}
      {accept}
    </Group>
  );
}

/**
 * The accept verb on a decided one: quiet (default variant), because believing again is a change of
 * mind, not the page's main act. Filled only for an accepted one whose scope the owner just edited.
 */
function DecidedAcceptButton({
  review,
  acceptLabel,
  label,
}: {
  review: DerivationReview;
  acceptLabel: string;
  label: string;
}) {
  const editingAccepted = review.view.status === "accepted";
  return (
    <Tooltip label={`${acceptLabel} · A`} withArrow>
      <Button
        flex={1}
        variant={editingAccepted ? "filled" : "default"}
        leftSection={<Check size={14} />}
        loading={review.decision.pending}
        disabled={!isCompleteScope(review.shownScope)}
        onClick={ignoringRepeatClicks(review.startAccept)}
      >
        {`${label}${review.needsPreview ? "…" : ""}`}
      </Button>
    </Tooltip>
  );
}

/** The rarer moves on a decided one, behind ⋯: put it back in the inbox, and edit the reason or reject. */
function DecidedMoreMenu({ review }: { review: DerivationReview }) {
  const status = review.view.status;
  return (
    <Menu position="bottom-end" withArrow>
      <Menu.Target>
        <ActionIcon variant="default" size="input-sm" aria-label="More actions">
          <Ellipsis size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {status === "rejected" ? (
          <Menu.Item leftSection={<PencilLine size={14} />} onClick={review.editReason}>
            Edit reason
          </Menu.Item>
        ) : (
          <Menu.Item leftSection={<X size={14} />} rightSection="R" onClick={review.startReject}>
            Reject…
          </Menu.Item>
        )}
        <Menu.Item leftSection={<Inbox size={14} />} onClick={review.reopen}>
          Put back in the inbox
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * The actions that fit its status, full width at the foot of the state card. Nothing while a panel
 * is open, or on one that can't be decided.
 */
export function DerivationActions({ review, acceptLabel }: { review: DerivationReview; acceptLabel: string }) {
  const { view, mode, draft } = review;
  if (mode !== "idle" || !canDecideDerivation(view)) return null;
  if (view.status === "pending")
    return (
      <PendingDecisionButtons
        stacked
        acceptLabel={acceptLabel}
        needsPreview={review.needsPreview}
        pending={review.decision.pending}
        acceptDisabled={!isCompleteScope(review.shownScope)}
        onAccept={ignoringRepeatClicks(review.startAccept)}
        onReject={ignoringRepeatClicks(review.startReject)}
      />
    );
  return (
    <Group gap="xs" wrap="nowrap">
      {view.status === "accepted" && draft === undefined && (
        <Tooltip label={`Stop applying it; you can ${acceptItPhrase(acceptLabel)} again later`} withArrow>
          <Button
            flex={1}
            variant="default"
            leftSection={<Undo2 size={14} />}
            loading={review.decision.pending && draft === undefined}
            onClick={ignoringRepeatClicks(review.retract)}
          >
            Retract
          </Button>
        </Tooltip>
      )}
      {view.status === "accepted" && draft !== undefined && (
        <DecidedAcceptButton review={review} acceptLabel={acceptLabel} label="Save scope" />
      )}
      {(view.status === "rejected" || view.status === "retracted") && (
        <DecidedAcceptButton review={review} acceptLabel={acceptLabel} label={acceptLabel} />
      )}
      <DecidedMoreMenu review={review} />
    </Group>
  );
}

/**
 * The Scope property: the picker while it can be decided, the accept following its draft. An accepted
 * one keeps applying where it does until Save scope is pressed.
 */
export function DerivationScopeProperty({ review, known }: { review: DerivationReview; known: KnownPlaces }) {
  const { view, draft, shownScope, baseScope } = review;
  if (!canDecideDerivation(view)) return <ScopeChips scope={view.effectiveScope} labels={known.labels} wrap="wrap" />;
  const locked = review.mode !== "idle" || review.decision.pending;
  return (
    <ScopePropertyField
      picker={{
        opened: review.pickerOpen,
        value: shownScope,
        proposed: view.proposedScope,
        known,
        onChange: review.changeDraft,
        onOpenedChange: review.setPickerOpen,
        disabled: locked,
      }}
      changes={draft === undefined ? [] : describeScopeChange(baseScope, shownScope, known.labelOf)}
      guessed={view.status === "pending" && view.scopeSource === "defaulted"}
      onRestore={locked ? undefined : () => review.changeDraft(undefined)}
    />
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

/**
 * The outcome alert and the acceptance preview, under the title. The reject reason opens in the state
 * card, beside the button that asked for it.
 */
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
