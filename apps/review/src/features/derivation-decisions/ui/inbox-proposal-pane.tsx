/**
 * The selected proposal, read top to bottom: what it says and who proposed it, where it would apply,
 * what it rests on, and the discussion so far. The decision sits in a footer stuck to the pane's
 * bottom edge, so Believe, Reject and Discuss are in reach however long the evidence runs.
 */
import { Box, Alert, Anchor, Button, Group, Loader, Paper, Popover, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import type { InboxCard } from "@tastebud/core/inbox";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { isCompleteScope } from "@tastebud/core/places";
import { ExternalLink, MessageSquare, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { recordDetailQuery, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatReviewTime, formatTimeAgo } from "#review/shared/format.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { DerivationSummaryLine } from "#review/shared/ui/derivation-link.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

import { AcceptancePreview } from "./acceptance-preview.tsx";
import { DerivationEvidence } from "./derivation-header.tsx";
import { DerivationThread } from "./derivation-thread.tsx";
import { ignoringRepeatClicks } from "./inbox-decided-row.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { scopeButtonPhrase } from "./scope-draft.ts";
import { ScopePicker } from "./scope-picker.tsx";
import type { InboxCardTriage } from "./use-inbox-card-triage.ts";
import { useReviewClockMs } from "./use-review-clock.ts";

const styles = stylex.create({
  statement: { fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.005em" },
  scopeRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minHeight: "22px" },
  footer: { position: "sticky", bottom: 0, zIndex: 1 },
  // Cautions sit after the buttons, so the buttons keep their place whether or not a card has one.
  cautions: { marginLeft: "auto", minWidth: 0 },
});

/** Said beside the buttons, so a past "no" or a near repeat is seen before the click, not only in the evidence. */
const cautionsOf = (view: InboxCard["derivation"], overlaps: number): ReadonlyArray<string> => [
  ...(view.despite.length > 0 ? ["You rejected something close to this"] : []),
  ...(overlaps === 1 ? ["Overlaps a near repeat"] : []),
  ...(overlaps > 1 ? [`Overlaps ${overlaps} near repeats`] : []),
];

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

/** Near matches of any status, behind a button so the keyboard and touch reach them too. */
function SimilarProposalsButton({ similar, plural }: { similar: InboxCard["related"]; plural: string }) {
  const catalog = useReviewCatalog();
  return (
    <Popover width={380} withArrow shadow="md" position="top-start">
      <Popover.Target>
        <Button size="xs" variant="subtle" color="gray" px="xs">
          ≈ {similar.length} similar
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="xs" c="dimmed" mb="xxs">
          Similar {plural}, any status
        </Text>
        <Stack gap="xxs">
          {similar.map((match) => (
            <DerivationSummaryLine catalog={catalog} key={match.id} summary={match} />
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/** "Applies in" with the picker, and what an edit changes, or why the scope was guessed. */
function InboxScopeLine({
  view,
  triage,
  known,
  queued,
}: {
  view: InboxCard["derivation"];
  triage: InboxCardTriage;
  known: KnownPlaces;
  queued: boolean;
}) {
  const locked = queued || triage.mode !== "idle" || triage.decision.pending;
  return (
    // No ⌘↵ here: while the picker is open it owns the keys, and believing waits until it is closed.
    <Box {...stylex.props(styles.scopeRow)}>
      <Text size="xs" c="dimmed">
        Applies in
      </Text>
      <ScopePicker
        value={triage.shownScope}
        proposed={triage.proposed}
        known={known}
        onChange={triage.changeDraft}
        opened={triage.pickerOpen}
        onOpenedChange={triage.setPickerOpen}
        disabled={locked}
      />
      {triage.edited && (
        <>
          <Text size="xs" c="dark.4">
            {triage.changes.join(" · ") || "Edited"}
          </Text>
          {!locked && (
            <Anchor component="button" size="xs" c="dimmed" onClick={() => triage.changeDraft(undefined)}>
              Restore
            </Anchor>
          )}
        </>
      )}
      {!triage.edited && view.scopeSource === "defaulted" && (
        <Text size="xs" c="dimmed">
          Guessed from where the agent was working
        </Text>
      )}
    </Box>
  );
}

/** Believe, Reject and Discuss, or the batch's wait while the card is queued. */
function InboxDecisionButtons({
  card,
  kind,
  known,
  triage,
  queued,
  onDiscuss,
}: {
  card: InboxCard;
  kind: DerivedKindView;
  known: KnownPlaces;
  triage: InboxCardTriage;
  queued: boolean;
  onDiscuss: () => void;
}) {
  const view = card.derivation;
  if (queued)
    return (
      <Group gap="xxs" wrap="nowrap">
        <Loader size={12} />
        <Text size="xs" c="dimmed">
          Queued: {kind.acceptLabel}
        </Text>
      </Group>
    );
  const similarShown = new Set([view.supersedes?.id, ...view.despite.map((earlier) => earlier.id)]);
  const similar = card.related.filter((match) => !similarShown.has(match.id));
  const cautions = cautionsOf(view, triage.edited ? 0 : card.needsAcknowledgement.length);
  const scopePhrase = isCompleteScope(triage.shownScope) ? scopeButtonPhrase(triage.shownScope, known.labelOf) : "";
  const verb = kind.acceptLabel;
  return (
    <Group gap="2xs" wrap="nowrap">
      <Tooltip label={triage.needsPreview ? `Review, then ${verb.toLowerCase()} · A` : `${verb} · A`} withArrow>
        <Button loading={triage.decision.pending} onClick={ignoringRepeatClicks(triage.accept)}>
          {`${verb} ${scopePhrase}`.trim()}
          {triage.needsPreview && "…"}
        </Button>
      </Tooltip>
      <Tooltip label="Reject with a reason · R" withArrow>
        <Button
          variant="subtle"
          color="gray"
          px="xs"
          leftSection={<X size={14} />}
          onClick={ignoringRepeatClicks(triage.startReject)}
        >
          Reject
        </Button>
      </Tooltip>
      <Tooltip label="Write a note to the agents · D" withArrow>
        <Button variant="subtle" color="gray" px="xs" leftSection={<MessageSquare size={14} />} onClick={onDiscuss}>
          {view.thread.length > 0 ? `Discuss (${view.thread.length})` : "Discuss"}
        </Button>
      </Tooltip>
      {similar.length > 0 && <SimilarProposalsButton similar={similar} plural={kind.plural} />}
      {cautions.length > 0 && (
        <Group gap="2xs" wrap="nowrap" {...stylex.props(styles.cautions)}>
          <TriangleAlert size={12} color="var(--mantine-color-orange-6)" aria-hidden />
          <Text size="xs" c="orange.8" truncate="end">
            {cautions.join(" · ")}
          </Text>
        </Group>
      )}
    </Group>
  );
}

/** The reject reason, the accept preview or a refusal, above the buttons they belong to. */
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
  const nowMs = useReviewClockMs();
  const owner = useReviewCatalog()?.owner ?? "";
  const listeners = useQuery(recordDetailQuery(card.derivation.id)).data?.listeners ?? [];
  const view = card.derivation;
  const record = view.derivation;
  const thread = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pane.scrollTo({ top: 0 });
  }, [pane]);
  // Discussing goes to the thread's own composer, which keeps its text while the proposal stays open.
  const discuss = () => {
    const field = thread.current?.querySelector("textarea");
    field?.focus();
    field?.scrollIntoView({ block: "nearest" });
  };
  return (
    <Stack gap="md">
      <SelectedCardHotkeys
        enabled={!triage.engaged && !queued}
        onAccept={triage.accept}
        onReject={triage.startReject}
        onDiscuss={discuss}
        onEditScope={() => triage.setPickerOpen(true)}
      />
      <Paper px="lg" py="md">
        <Stack gap="sm">
          <Stack gap="3xs">
            <Text fz="cardStatement" {...stylex.props(styles.statement)}>
              {view.statement}
            </Text>
            <Group gap="xs">
              <Text size="xs" c="dimmed" title={formatReviewTime(record.proposed_at)}>
                Proposed by {record.proposed_by} · {formatTimeAgo(record.proposed_at, nowMs)}
              </Text>
              <AnchorLink to="/derivations/$id" params={{ id: view.id }} size="xs" c="dimmed">
                <Group gap="3xs" wrap="nowrap" component="span">
                  Open full page
                  <ExternalLink size={11} aria-hidden />
                </Group>
              </AnchorLink>
            </Group>
          </Stack>
          <InboxScopeLine view={view} triage={triage} known={known} queued={queued} />
        </Stack>
      </Paper>
      <DerivationEvidence view={view} kind={kind} />
      <Paper p="md" ref={thread}>
        <DerivationThread
          derivationId={view.id}
          thread={view.thread}
          owner={owner}
          listeners={listeners}
          focusComposer={false}
        />
      </Paper>
      <Paper px="lg" py="sm" shadow="md" {...stylex.props(styles.footer)}>
        <Stack gap="sm">
          <InboxDecisionForms view={view} kind={kind} known={known} triage={triage} />
          {triage.mode === "idle" && (
            <InboxDecisionButtons
              card={card}
              kind={kind}
              known={known}
              triage={triage}
              queued={queued}
              onDiscuss={discuss}
            />
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
