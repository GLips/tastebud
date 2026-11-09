/**
 * The derivation's decision controls: the actions that fit its status (at the foot of the state card),
 * the Scope property the accept follows, and whichever panel is open (reject reason or acceptance
 * preview). State lives in `use-derivation-review.ts`. Hotkeys live in tooltips, never in the buttons.
 */
import { ActionIcon, Alert, Button, Group, Menu, Tooltip } from "@mantine/core";
import { describeScopeChange, isCompleteScope } from "@tastebud/core/places";
import type { DerivationView } from "@tastebud/core/record-views";
import { Check, Ellipsis, Inbox, Undo2, X } from "lucide-react";
import type { MouseEventHandler } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { useReviewHotkeys } from "#review/shared/review-hotkeys.ts";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";

import { acceptItPhrase } from "./accept-wording.ts";
import { AcceptancePreview } from "./acceptance-preview.tsx";
import type { DerivationVersions } from "./derivation-related.tsx";
import { ignoringRepeatClicks } from "./inbox-decided-row.tsx";
import { scopeOverrideOf } from "./scope-draft.ts";
import { ScopePropertyField } from "./scope-picker.tsx";
import { canDecideDerivation, type DerivationReview } from "./use-derivation-review.ts";

/** What an accept from each decided status changes, for the preview to say before it is sent. */
const ACCEPT_CONSEQUENCES: Partial<Record<DerivationView["status"], string>> = {
  accepted: "It stays accepted. From now on it applies only where shown above.",
  rejected: "It becomes accepted and applies where shown above.",
  retracted: "It becomes accepted again and applies where shown above.",
};

/**
 * Reject beside the filled accept verb: a waiting proposal's two answers. The page and the inbox pane
 * both use it. The verb ends in "…" when a known near repeat means the preview comes first.
 */
export function PendingDecisionButtons({
  acceptLabel,
  needsPreview = false,
  pending,
  acceptDisabled = false,
  onAccept,
  onReject,
  oneOfSelection = false,
}: {
  acceptLabel: string;
  needsPreview?: boolean;
  pending: boolean;
  acceptDisabled?: boolean;
  onAccept: MouseEventHandler<HTMLButtonElement>;
  onReject: MouseEventHandler<HTMLButtonElement>;
  /**
   * Rows are checked in the inbox, whose bar then owns a and r: these buttons say they decide just this
   * proposal, and their tooltips drop the keys.
   */
  oneOfSelection?: boolean;
}) {
  const scoped = (label: string) => (oneOfSelection ? `${label} this one` : label);
  const keyed = (label: string, key: string) => (oneOfSelection ? label : `${label} · ${key}`);
  const reject = (
    <Tooltip label={keyed("Reject with a reason", "R")} withArrow>
      <Button variant="default" leftSection={<X size={14} />} onClick={onReject}>
        {scoped("Reject")}
      </Button>
    </Tooltip>
  );
  const accept = (
    <Tooltip label={keyed(needsPreview ? `Review, then ${acceptLabel.toLowerCase()}` : acceptLabel, "A")} withArrow>
      <Button leftSection={<Check size={14} />} loading={pending} disabled={acceptDisabled} onClick={onAccept}>
        {`${scoped(acceptLabel)}${needsPreview ? "…" : ""}`}
      </Button>
    </Tooltip>
  );
  return (
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
        {label}
      </Button>
    </Tooltip>
  );
}

/** The rarer moves on a decided one, behind ⋯: reject, and put it back in the inbox. The Reason's Edit link is the one way to edit it. */
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
        {status !== "rejected" && (
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
 * is open, or on one that can't be decided. Their clicks also ignore a double click's second: the
 * buttons swap when the refreshed view arrives, which can land after the hook's settle window.
 */
export function DerivationActions({ review, acceptLabel }: { review: DerivationReview; acceptLabel: string }) {
  const { view, mode, draft } = review;
  if (mode !== "idle" || !canDecideDerivation(view)) return null;
  if (view.status === "pending")
    return (
      <PendingDecisionButtons
        acceptLabel={acceptLabel}
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
 * the decision just made here, Esc drops a changed scope and otherwise goes back. No key fires from
 * a text field, though a clicked checkbox or tab doesn't hold them, and none fire while a panel or list is open.
 */
export function useDerivationPageHotkeys(review: DerivationReview, goBack: () => void) {
  const { view, mode, pickerOpen } = review;
  const idle = mode === "idle" && !pickerOpen;
  const decidable = idle && canDecideDerivation(view);
  useReviewHotkeys([
    { hotkey: "A", callback: review.startAccept, options: { enabled: decidable && view.status !== "accepted" } },
    {
      hotkey: "R",
      callback: review.startReject,
      options: { enabled: decidable && view.status !== "rejected" },
    },
    { hotkey: "S", callback: review.openPicker, options: { enabled: decidable } },
    { hotkey: "U", callback: review.undo, options: { enabled: idle && review.undoable !== undefined } },
    // Skipped in text fields: here it would go back the moment Esc closes the reject box.
    {
      hotkey: "Escape",
      callback: () => (review.draft === undefined ? goBack() : review.changeDraft(undefined)),
      options: { enabled: idle },
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
  versions,
}: {
  review: DerivationReview;
  acceptLabel: string;
  known: KnownPlaces;
  versions: DerivationVersions;
}) {
  const { view, mode, setMode, decision, shownScope } = review;
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
          versions={versions}
          verb={acceptLabel}
          consequence={ACCEPT_CONSEQUENCES[view.status]}
          active
          pending={decision.pending}
          labels={known.labels}
          onConfirm={(acknowledges) => void review.accept(acknowledges)}
          onBack={() => setMode("idle")}
        />
      )}
    </>
  );
}
