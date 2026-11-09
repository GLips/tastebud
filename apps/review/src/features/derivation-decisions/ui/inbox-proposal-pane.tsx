/**
 * The selected proposal, built from the same parts as its page: the title row with Reject and the accept
 * verb over its properties, Scope picker included (held at the pane's top while the evidence scrolls, as
 * the accept follows the scope), then what it rests on, how it relates to other records, and the
 * activity feed with the note composer.
 */
import { Box, Alert, Group, Loader, Paper, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import type { InboxCard } from "@tastebud/core/inbox";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";

import { recordDetailQuery, useReviewCatalog } from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

import { AcceptancePreview } from "./acceptance-preview.tsx";
import { DerivationActivity } from "./derivation-activity.tsx";
import { DerivationRestsOn, DerivationTitleRow } from "./derivation-header.tsx";
import { DerivationProperties } from "./derivation-properties.tsx";
import { DerivationRelated } from "./derivation-related.tsx";
import { PendingDecisionButtons } from "./derivation-review.tsx";
import { ignoringRepeatClicks } from "./inbox-decided-row.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { ScopePropertyField } from "./scope-picker.tsx";
import type { InboxCardTriage } from "./use-inbox-card-triage.ts";

const styles = stylex.create({
  head: { position: "sticky", top: 0, zIndex: 1 },
});

/** Mounted with the pane, which only the selected card has, so a/r/d/s act on exactly one proposal. */
function SelectedCardHotkeys(props: {
  enabled: boolean;
  onAccept: () => void;
  onReject: () => void;
  onDiscuss: () => void;
  onEditScope: () => void;
}) {
  const options = { enabled: props.enabled };
  useHotkeys([
    { hotkey: "A", callback: props.onAccept, options },
    { hotkey: "R", callback: props.onReject, options },
    { hotkey: "D", callback: props.onDiscuss, options },
    { hotkey: "S", callback: props.onEditScope, options },
  ]);
  return null;
}

/** Reject and the accept verb, or the batch's wait while the card is queued; nothing while a form is open. */
function InboxDecisionButtons({
  kind,
  triage,
  queued,
}: {
  kind: DerivedKindView;
  triage: InboxCardTriage;
  queued: boolean;
}) {
  if (queued)
    return (
      <Group gap="xxs" wrap="nowrap">
        <Loader size={12} />
        <Text size="xs" c="dimmed">
          Queued: {kind.acceptLabel}
        </Text>
      </Group>
    );
  if (triage.mode !== "idle") return null;
  return (
    <PendingDecisionButtons
      acceptLabel={kind.acceptLabel}
      needsPreview={triage.needsPreview}
      pending={triage.decision.pending}
      onAccept={ignoringRepeatClicks(triage.accept)}
      onReject={ignoringRepeatClicks(triage.startReject)}
    />
  );
}

/** The reject reason, the accept preview or a refusal, under the title row whose buttons opened them. */
function InboxDecisionForms({
  view,
  kind,
  known,
  triage,
}: {
  view: InboxCard["derivation"];
  kind: DerivedKindView;
  known: KnownPlaces;
  triage: InboxCardTriage;
}) {
  const { decision } = triage;
  return (
    <>
      {triage.mode === "rejecting" && (
        <RejectReasonForm
          initialReason={triage.rejectReason}
          onReasonChange={triage.setRejectReason}
          pending={decision.pending}
          onCancel={() => triage.setMode("idle")}
          onSubmit={(reason) => void triage.submitReject(reason)}
        />
      )}
      {triage.mode === "previewing" && (
        <AcceptancePreview
          target={view.id}
          statement={view.statement}
          override={triage.override}
          proposedScope={triage.proposed}
          changes={triage.changes}
          verb={kind.acceptLabel}
          active
          conflict={triage.conflict}
          pending={decision.pending}
          labels={known.labels}
          onConfirm={(acknowledges) => void triage.submitAccept(acknowledges)}
          onBack={() => triage.setMode("idle")}
        />
      )}
      {decision.failure !== undefined && decision.failure.tag !== "WideningNeedsAcknowledgement" && (
        <Alert color="red" variant="light" withCloseButton onClose={decision.clearFailure} py="xxs">
          {decision.failure.sentence}
        </Alert>
      )}
    </>
  );
}

export function InboxProposalPane({
  card,
  kind,
  known,
  triage,
  queued,
  pane,
}: {
  card: InboxCard;
  kind: DerivedKindView;
  known: KnownPlaces;
  triage: InboxCardTriage;
  queued: boolean;
  /** The scrolling column this renders into: each proposal opens at its top. */
  pane: HTMLElement;
}) {
  const owner = useReviewCatalog()?.owner ?? "";
  const detail = useQuery(recordDetailQuery(card.derivation.id)).data;
  const view = card.derivation;
  const activity = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pane.scrollTo({ top: 0 });
  }, [pane]);
  // Discussing goes to the feed's own composer, which keeps its text while the proposal stays open.
  const discuss = () => {
    const field = activity.current?.querySelector("textarea");
    field?.focus();
    field?.scrollIntoView({ block: "nearest" });
  };
  const locked = queued || triage.mode !== "idle" || triage.decision.pending;
  return (
    <Stack gap="lg">
      <SelectedCardHotkeys
        enabled={!triage.engaged && !queued}
        onAccept={triage.accept}
        onReject={triage.startReject}
        onDiscuss={discuss}
        onEditScope={() => triage.setPickerOpen(true)}
      />
      <Paper px="lg" py="md" {...stylex.props(styles.head)}>
        <Stack gap="sm">
          <DerivationTitleRow
            size="pane"
            statement={view.statement}
            status={view.status}
            meta={
              <AnchorLink to="/derivations/$id" params={{ id: view.id }} size="xs" c="dimmed">
                <Group gap="3xs" wrap="nowrap" component="span">
                  Open full page
                  <ExternalLink size={11} aria-hidden />
                </Group>
              </AnchorLink>
            }
            actions={<InboxDecisionButtons kind={kind} triage={triage} queued={queued} />}
          />
          <InboxDecisionForms view={view} kind={kind} known={known} triage={triage} />
          <DerivationProperties
            view={view}
            kind={kind}
            owner={owner}
            host="pane"
            scope={
              // No ⌘↵ here: while the picker is open it owns the keys, and believing waits until it is closed.
              <ScopePropertyField
                picker={{
                  value: triage.shownScope,
                  proposed: triage.proposed,
                  known,
                  onChange: triage.changeDraft,
                  opened: triage.pickerOpen,
                  onOpenedChange: triage.setPickerOpen,
                  disabled: locked,
                }}
                changes={triage.edited ? triage.changes : []}
                guessed={view.scopeSource === "defaulted"}
                onRestore={locked ? undefined : () => triage.changeDraft(undefined)}
              />
            }
          />
        </Stack>
      </Paper>
      <DerivationRestsOn view={view} kind={kind} />
      <DerivationRelated
        view={view}
        known={known}
        backlinks={{
          ...detail,
          // Once the scope is edited, the near repeats are re-checked in the preview instead.
          nearRepeats: triage.edited ? [] : card.needsAcknowledgement,
          similar: card.related,
        }}
      />
      <Box ref={activity}>
        <DerivationActivity
          view={view}
          owner={owner}
          known={known}
          listeners={detail?.listeners ?? []}
          focusComposer={false}
        />
      </Box>
    </Stack>
  );
}
