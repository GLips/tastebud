/**
 * The selected proposal, built from the same parts as its page: the title with one meta line, then the
 * Scope picker beside Reject and the accept verb (held at the pane's top while the evidence scrolls, as
 * the accept follows the scope), then what it rests on, how it relates to other records, and the
 * activity feed with the note composer.
 */
import { Box, Alert, Group, Loader, Paper, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import type { InboxCard } from "@tastebud/core/inbox";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { isCompleteScope } from "@tastebud/core/places";
import type { DerivationSummary } from "@tastebud/core/record-views";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";

import { recordDetailQuery, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { describeAuthor, formatReviewDate, formatReviewTime } from "#review/shared/format.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DerivationStatusBadge } from "#review/shared/ui/status-chips.tsx";
import { SubjectChip } from "#review/shared/ui/subject-chip.tsx";
import { otherSubjectOf } from "#review/shared/ui/subject-of.ts";

import { AcceptancePreview } from "./acceptance-preview.tsx";
import { DerivationActivity } from "./derivation-activity.tsx";
import { DerivationRestsOn, DerivationTitleRow } from "./derivation-header.tsx";
import { DerivationRelated, versionsOf } from "./derivation-related.tsx";
import { PendingDecisionButtons } from "./derivation-review.tsx";
import { ignoringRepeatClicks } from "./inbox-decided-row.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { ScopePropertyField } from "./scope-picker.tsx";
import type { InboxCardTriage } from "./use-inbox-card-triage.ts";

const styles = stylex.create({
  head: { position: "sticky", top: 0, zIndex: 1 },
});

/** The pane's properties as one line under the title, so the evidence starts close to it. */
function PaneMetaLine({ view, owner }: { view: InboxCard["derivation"]; owner: string }) {
  return (
    <>
      <DerivationStatusBadge status={view.status} />
      <Text size="xs" c="dimmed" title={formatReviewTime(view.proposedAt)}>
        Proposed {formatReviewDate(view.proposedAt)} by {describeAuthor(view.derivation.proposed_by, owner)}
      </Text>
      {otherSubjectOf(view, owner) !== undefined && <SubjectChip summary={view} owner={owner} />}
      <AnchorLink to="/derivations/$id" params={{ id: view.id }} size="xs" c="dimmed">
        <Group gap="3xs" wrap="nowrap" component="span">
          Open full page
          <ExternalLink size={11} aria-hidden />
        </Group>
      </AnchorLink>
    </>
  );
}

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
      acceptDisabled={!isCompleteScope(triage.shownScope)}
      onAccept={ignoringRepeatClicks(triage.accept)}
      onReject={ignoringRepeatClicks(triage.startReject)}
      oneOfSelection={triage.selectionHoldsKeys}
    />
  );
}

/** The reject reason, the accept preview or a refusal, under the title row whose buttons opened them. */
function InboxDecisionForms({
  view,
  despitedBy,
  kind,
  known,
  triage,
}: {
  view: InboxCard["derivation"];
  /** The newer proposals made despite this one, from its detail once loaded. */
  despitedBy: ReadonlyArray<DerivationSummary> | undefined;
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
          versions={versionsOf(view, despitedBy)}
          verb={kind.acceptLabel}
          active
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
        enabled={!triage.engaged && !queued && !triage.selectionHoldsKeys}
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
            meta={<PaneMetaLine view={view} owner={owner} />}
          />
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
            {/* No ⌘↵ here: while the picker is open it owns the keys, and believing waits until it is closed. */}
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
            <InboxDecisionButtons kind={kind} triage={triage} queued={queued} />
          </Group>
          <InboxDecisionForms view={view} despitedBy={detail?.despitedBy} kind={kind} known={known} triage={triage} />
        </Stack>
      </Paper>
      <DerivationRestsOn view={view} kind={kind} owner={owner} />
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
