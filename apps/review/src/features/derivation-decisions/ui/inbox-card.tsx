/**
 * One pending proposal in the inbox: a compact row in the queue and, while selected, the detail pane
 * beside it where it is decided. The pane is portalled into the page's pane column, so the card keeps
 * its triage state (rejecting, previewing, writing a note, its decision and Undo) whichever row is
 * open. The scope draft lives with the inbox so batch accept can tell edited cards apart.
 */
import { Box, Alert, Anchor, Button, Group, Loader, Paper, Popover, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQueryClient } from "@tanstack/react-query";
import type { InboxCard } from "@tastebud/core/inbox";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import {
  describeScopeChange,
  isCompleteScope,
  isSameScope,
  isScopeNarrowing,
  type ScopeDraft,
} from "@tastebud/core/places";
import { MessageSquare, TriangleAlert, X } from "lucide-react";
import { type Ref, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatReviewTime, formatTimeAgo } from "#review/shared/format.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { acceptPreviewsStaleOf } from "#review/shared/query-keys.ts";
import { refreshReviewQueriesAfterWrite } from "#review/shared/refresh-after-write.ts";
import { DerivationSummaryLine } from "#review/shared/ui/derivation-link.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

import { AcceptancePreview } from "./acceptance-preview.tsx";
import { DerivationEvidence } from "./derivation-header.tsx";
import { ignoringRepeatClicks, InboxDecidedRow } from "./inbox-decided-row.tsx";
import { InboxNote, type InboxNoteState } from "./inbox-note.tsx";
import { InboxProposalRow, type InboxRowFlag } from "./inbox-proposal-row.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { scopeButtonPhrase, scopeOverrideOf } from "./scope-draft.ts";
import { ScopePicker } from "./scope-picker.tsx";
import { useReviewClockMs } from "./use-review-clock.ts";
import { useReviewDecision } from "./use-review-decision.ts";

const styles = stylex.create({
  statement: { fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.005em" },
  scopeRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minHeight: "22px" },
  // Sticks to the pane's bottom edge when an open picker or a long form pushes it down, so the
  // buttons are never scrolled out of reach.
  actions: {
    position: "sticky",
    bottom: 0,
    zIndex: 1,
    paddingBlock: "8px",
    backgroundColor: "var(--mantine-color-white)",
  },
  // Cautions sit after the buttons, so the buttons keep their place whether or not a card has one.
  cautions: { marginLeft: "auto", minWidth: 0 },
});

/** Said beside the buttons, so a past "no" or a near repeat is seen before the click, not only in the evidence. */
const cautionsOf = (view: InboxCard["derivation"], overlaps: number): ReadonlyArray<string> => [
  ...(view.despite.length > 0 ? ["You rejected something close to this"] : []),
  ...(overlaps === 1 ? ["Overlaps a near repeat"] : []),
  ...(overlaps > 1 ? [`Overlaps ${overlaps} near repeats`] : []),
];

/** What a row says about a proposal before it is opened. */
const rowFlagsOf = (
  card: InboxCard,
  { edited, queued, backlog }: { edited: boolean; queued: boolean; backlog: boolean },
): ReadonlyArray<InboxRowFlag> => {
  const view = card.derivation;
  const notes = view.thread.length;
  return [
    ...(queued ? [{ text: "Queued", caution: false }] : []),
    ...(edited ? [{ text: "Scope changed", caution: false }] : []),
    ...(!backlog && view.contradictingSources.length > 0 ? [{ text: "Says the opposite", caution: true }] : []),
    ...(view.despite.length > 0 ? [{ text: "Close to something you rejected", caution: true }] : []),
    ...(!edited && card.needsAcknowledgement.length > 0 ? [{ text: "Overlaps a near repeat", caution: true }] : []),
    ...(notes > 0 ? [{ text: notes === 1 ? "1 note" : `${notes} notes`, caution: false }] : []),
  ];
};

type CardMode = "idle" | "rejecting" | "previewing";

/** Mounted only in the selected, idle card, so a/r/d/s always act on exactly one proposal. */
function SelectedCardHotkeys(props: {
  onAccept: () => void;
  onReject: () => void;
  onDiscuss: () => void;
  onEditScope: () => void;
}) {
  useHotkeys([
    { hotkey: "A", callback: props.onAccept },
    { hotkey: "R", callback: props.onReject },
    { hotkey: "D", callback: props.onDiscuss },
    { hotkey: "S", callback: props.onEditScope },
  ]);
  return null;
}

/** Near matches of any status, behind a button so the keyboard and touch reach them too. */
function SimilarProposalsButton({ similar, plural }: { similar: InboxCard["related"]; plural: string }) {
  const catalog = useReviewCatalog();
  return (
    <Popover width={380} withArrow shadow="md" position="bottom-start">
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

/** Accepts one card as proposed for a batch; resolves to the refusal sentence, or undefined once it landed. */
export type InboxBatchAccepter = () => Promise<string | undefined>;

export function InboxProposalCard({
  card,
  kind,
  selected,
  queued,
  draft,
  known,
  pane,
  batchAccepters,
  onSelect,
  onDraftChange,
  onEngagedChange,
  onDecided,
  decided,
  latestDecided,
  onUndone,
  ref,
}: {
  card: InboxCard;
  kind: DerivedKindView;
  selected: boolean;
  /** Waiting its turn in a batch accept: locked, so what the batch counted as unchanged stays so. */
  queued: boolean;
  /** The edited scope, or undefined while it is as proposed. */
  draft: ScopeDraft | undefined;
  known: KnownPlaces;
  /** The page's detail column, which the selected card renders into. */
  pane: HTMLElement | null;
  /** Where the card offers its as-proposed accept to a group's batch, so a batch decides through the card. */
  batchAccepters: Map<string, InboxBatchAccepter>;
  onSelect: () => void;
  onDraftChange: (draft: ScopeDraft | undefined) => void;
  /** True while this card holds the keyboard: editing, rejecting, previewing, writing a note or submitting. */
  onEngagedChange: (engaged: boolean) => void;
  onDecided: () => void;
  /** Decided from this card: it folds to its outcome with Undo, staying mounted so the undo survives. */
  decided: boolean;
  /** The newest decision made in the inbox: `u` undoes it. */
  latestDecided: boolean;
  /** The undo landed and the proposal is pending again. */
  onUndone: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  const nowMs = useReviewClockMs();
  const { derivation: view } = card;
  const record = view.derivation;
  const decision = useReviewDecision(view.id, {
    ...view,
    acknowledges: view.decisions.findLast((entry) => entry.outcome === "accept")?.acknowledges,
  });
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<CardMode>("idle");
  const [conflict, setConflict] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  // The picker lives in the pane, so it closes with the card's selection rather than staying open unseen.
  if (pickerOpen && !selected) setPickerOpen(false);
  const [note, setNote] = useState<InboxNoteState>("closed");
  const proposed = view.proposedScope;
  const shownScope = draft ?? proposed;
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(() => new Set());
  // Acknowledgements belong to the scope they were given for: any change unchecks every box.
  const changeDraft = (next: ScopeDraft | undefined) => {
    setAcknowledged(new Set());
    onDraftChange(next === undefined || isSameScope(proposed, next) ? undefined : next);
  };
  const override = scopeOverrideOf(proposed, draft);
  const edited = draft !== undefined && !isSameScope(proposed, draft);
  const changes = describeScopeChange(proposed, shownScope, known.labelOf);
  // A conflict always previews; an edit previews only when it reaches somewhere the agent didn't propose.
  const needsPreview =
    card.needsAcknowledgement.length > 0 || (edited && !(isCompleteScope(draft) && isScopeNarrowing(proposed, draft)));
  const engaged = mode !== "idle" || decision.pending || pickerOpen || note === "writing";

  useEffect(() => {
    onEngagedChange(engaged);
    return () => onEngagedChange(false);
  }, [engaged, onEngagedChange]);

  // Back to idle with nothing half-typed, so an Undo returns a clean card.
  const settleDecided = () => {
    setMode("idle");
    setRejectReason("");
    setNote("closed");
    onDecided();
  };
  const acceptAsProposed: InboxBatchAccepter = async () => {
    const outcome = await decision.decide({ outcome: "accept" });
    if (!outcome.ok) return outcome.failure.sentence;
    settleDecided();
    return undefined;
  };
  // The card opens at the top of its evidence, not wherever the last one left the pane scrolled.
  useEffect(() => {
    if (selected) pane?.scrollTo({ top: 0 });
  }, [selected, pane]);
  // Re-registered every render so a batch always calls the card as it now is.
  useEffect(() => {
    batchAccepters.set(view.id, acceptAsProposed);
    return () => void batchAccepters.delete(view.id);
  });

  const submitAccept = async (acknowledges: ReadonlyArray<string>) => {
    if (decision.pending) return;
    const outcome = await decision.decide({ outcome: "accept", ...override, acknowledges });
    if (outcome.ok) settleDecided();
    else if (outcome.failure.tag === "WideningNeedsAcknowledgement") {
      setConflict(true);
      setMode("previewing");
      await refreshReviewQueriesAfterWrite(queryClient, acceptPreviewsStaleOf(view.id));
    }
  };
  const submitReject = async (reason: string) => {
    if (decision.pending) return;
    const outcome = await decision.decide({ outcome: "reject", reason });
    if (outcome.ok) settleDecided();
  };
  const undo = async () => {
    const outcome = await decision.undo();
    if (outcome?.ok) onUndone();
  };
  const accept = () => {
    if (decision.pending || queued) return;
    if (draft !== undefined && !isCompleteScope(draft)) return setPickerOpen(true);
    setPickerOpen(false);
    if (!needsPreview) return void submitAccept([]);
    setConflict(false);
    setMode("previewing");
  };
  const startReject = () => {
    setNote("closed");
    setMode("rejecting");
  };
  const similarShown = new Set([view.supersedes?.id, ...view.despite.map((earlier) => earlier.id)]);
  const similar = card.related.filter((match) => !similarShown.has(match.id));
  const cautions = cautionsOf(view, edited ? 0 : card.needsAcknowledgement.length);

  if (decided)
    return (
      <InboxDecidedRow
        id={view.id}
        statement={view.statement}
        undoable={decision.undoable}
        undoing={decision.pending}
        onUndo={() => void undo()}
        latest={latestDecided}
      />
    );

  const detail = (
    <Stack gap="md">
      {selected && !engaged && !queued && (
        <SelectedCardHotkeys
          onAccept={accept}
          onReject={startReject}
          onDiscuss={() => setNote("writing")}
          onEditScope={() => setPickerOpen(true)}
        />
      )}
      <Paper px="lg" pt="md" pb="xs">
        <Stack gap="sm">
          <Stack gap="3xs">
            <AnchorLink
              to="/derivations/$id"
              params={{ id: view.id }}
              c="inherit"
              underline="never"
              fz="cardStatement"
              {...stylex.props(styles.statement)}
            >
              {view.statement}
            </AnchorLink>
            <Text size="xs" c="dimmed" title={formatReviewTime(record.proposed_at)}>
              Proposed by {record.proposed_by} · {formatTimeAgo(record.proposed_at, nowMs)}
            </Text>
          </Stack>

          <Box
            {...stylex.props(styles.scopeRow)}
            onKeyDown={(event) => {
              // The picker leaves ⌘↵ to its host: here it confirms with the card's own accept.
              if (pickerOpen && event.key === "Enter" && (event.metaKey || event.ctrlKey)) accept();
            }}
          >
            <Text size="xs" c="dimmed">
              Applies in
            </Text>
            <ScopePicker
              value={shownScope}
              proposed={proposed}
              known={known}
              onChange={changeDraft}
              opened={pickerOpen}
              onOpenedChange={setPickerOpen}
              disabled={queued || mode !== "idle" || decision.pending}
            />
            {edited ? (
              <>
                <Text size="xs" c="dark.4">
                  {changes.join(" · ") || "Edited"}
                </Text>
                {mode === "idle" && !queued && (
                  <Anchor component="button" size="xs" c="dimmed" onClick={() => changeDraft(undefined)}>
                    Restore
                  </Anchor>
                )}
              </>
            ) : (
              view.scopeSource === "defaulted" && (
                <Text size="xs" c="dimmed">
                  Guessed from where the agent was working
                </Text>
              )
            )}
          </Box>

          {mode === "idle" && queued && (
            <Group gap="xxs" wrap="nowrap" {...stylex.props(styles.actions)}>
              <Loader size={12} />
              <Text size="xs" c="dimmed">
                Queued: {kind.acceptLabel}
              </Text>
            </Group>
          )}
          {mode === "idle" && !queued && (
            <Group gap="2xs" wrap="nowrap" {...stylex.props(styles.actions)}>
              <Tooltip
                label={needsPreview ? `Review, then ${kind.acceptLabel.toLowerCase()} · A` : `${kind.acceptLabel} · A`}
                withArrow
              >
                <Button loading={decision.pending} onClick={ignoringRepeatClicks(accept)}>
                  {`${kind.acceptLabel} ${isCompleteScope(shownScope) ? scopeButtonPhrase(shownScope, known.labelOf) : ""}`.trim()}
                  {needsPreview && "…"}
                </Button>
              </Tooltip>
              <Tooltip label="Reject with a reason · R" withArrow>
                <Button
                  variant="subtle"
                  color="gray"
                  px="xs"
                  leftSection={<X size={14} />}
                  onClick={ignoringRepeatClicks(startReject)}
                >
                  Reject
                </Button>
              </Tooltip>
              <Tooltip label="Write a note to the agents · D" withArrow>
                <Button
                  variant={note === "writing" ? "light" : "subtle"}
                  color="gray"
                  px="xs"
                  leftSection={<MessageSquare size={14} />}
                  onClick={() => setNote(note === "writing" ? "closed" : "writing")}
                >
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
          )}

          <InboxNote derivationId={view.id} state={note} onStateChange={setNote} />

          {mode === "rejecting" && (
            <RejectReasonForm
              initialReason={rejectReason}
              onReasonChange={setRejectReason}
              pending={decision.pending}
              onCancel={() => setMode("idle")}
              onSubmit={(reason) => void submitReject(reason)}
            />
          )}

          {mode === "previewing" && (
            <AcceptancePreview
              target={view.id}
              statement={view.statement}
              override={override}
              proposedScope={proposed}
              changes={changes}
              verb={kind.acceptLabel}
              active={selected}
              acknowledged={acknowledged}
              onAcknowledge={(id, checked) => {
                const ids = new Set(acknowledged);
                if (checked) ids.add(id);
                else ids.delete(id);
                setAcknowledged(ids);
              }}
              conflict={conflict}
              pending={decision.pending}
              labels={known.labels}
              onConfirm={(acknowledges) => void submitAccept(acknowledges)}
              onBack={() => setMode("idle")}
            />
          )}

          {decision.failure !== undefined && decision.failure.tag !== "WideningNeedsAcknowledgement" && (
            <Alert color="red" variant="light" withCloseButton onClose={decision.clearFailure} py="xxs">
              {decision.failure.sentence}
            </Alert>
          )}
        </Stack>
      </Paper>
      <DerivationEvidence view={view} kind={kind} />
    </Stack>
  );

  return (
    <>
      <InboxProposalRow
        ref={ref}
        statement={view.statement}
        scope={isCompleteScope(shownScope) ? shownScope : undefined}
        flags={rowFlagsOf(card, { edited, queued, backlog: kind.recall === "never" })}
        selected={selected}
        onSelect={onSelect}
      />
      {selected && pane !== null && createPortal(detail, pane)}
    </>
  );
}
