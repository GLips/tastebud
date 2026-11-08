/**
 * One pending proposal with everything needed to decide it. Only the selected card is expanded; the
 * rest stay compact so the queue scans. The card owns its own triage state (rejecting, previewing,
 * writing a note); the scope draft lives with the inbox so batch accept can tell edited cards apart.
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
import type { SourceView } from "@tastebud/core/record-views";
import { MessageSquare, TriangleAlert, X } from "lucide-react";
import { type Ref, useEffect, useState } from "react";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatReviewTime, formatTimeAgo } from "#review/shared/format.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { acceptPreviewsStaleOf } from "#review/shared/query-keys.ts";
import { refreshReviewQueriesAfterWrite } from "#review/shared/refresh-after-write.ts";
import { DerivationSummaryLine, DespiteNotice, SupersedesNotice } from "#review/shared/ui/derivation-link.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SourceQuote, type SourceQuoteRole } from "#review/shared/ui/source-quote.tsx";

import { AcceptancePreview } from "./acceptance-preview.tsx";
import { ignoringRepeatClicks, InboxDecidedRow } from "./inbox-decided-row.tsx";
import { InboxNote, type InboxNoteState } from "./inbox-note.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { scopeButtonPhrase, scopeOverrideOf } from "./scope-draft.ts";
import { ScopePicker } from "./scope-picker.tsx";
import { useReviewClockMs } from "./use-review-clock.ts";
import { useReviewDecision } from "./use-review-decision.ts";

const styles = stylex.create({
  shrinkable: { minWidth: 0 },
  card: {
    transitionProperty: "box-shadow, border-color",
    transitionDuration: "120ms",
    cursor: "default",
    // Scrolled into view below the shell header and the sticky group header (about 56px) over it.
    scrollMarginTop: "calc(var(--review-shell-header-height) + 64px)",
    scrollMarginBottom: "24px",
  },
  selected: { borderColor: "var(--mantine-color-tastebud-4)" },
  statement: { fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.005em" },
  scopeRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minHeight: "22px" },
  // Cautions sit after the buttons, so the buttons keep their place whether or not a card has one.
  cautions: { marginLeft: "auto", minWidth: 0 },
  quotes: { paddingTop: "2px" },
  reasoning: { whiteSpace: "pre-wrap", lineHeight: 1.45 },
  quoteGroupLabel: { letterSpacing: "0.02em" },
});

type QuoteGroup = { label?: string; role: SourceQuoteRole; sources: ReadonlyArray<SourceView> };

/**
 * The quotes in word-labelled groups, so supporting and contradicting read apart without relying on
 * the quote mark's colour. Contradicting quotes get no heading because `SourceQuote` already says
 * "Says the opposite" on each one. A backlog kind's quotes only prompted it, so they share one label.
 */
function InboxCardQuotes({ view, backlog }: { view: InboxCard["derivation"]; backlog: boolean }) {
  const groups: ReadonlyArray<QuoteGroup> = backlog
    ? [
        {
          label: "What prompted this",
          role: "prompted",
          sources: [...view.supportingSources, ...view.contradictingSources],
        },
      ]
    : [
        { label: "Supports this", role: "supports", sources: view.supportingSources },
        { role: "contradicts", sources: view.contradictingSources },
      ];
  return groups
    .filter((group) => group.sources.length > 0)
    .map((group) => (
      <Stack key={group.role} gap="xxs" {...stylex.props(styles.quotes)}>
        {group.label !== undefined && (
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" {...stylex.props(styles.quoteGroupLabel)}>
            {group.label}
          </Text>
        )}
        {group.sources.map((source) => (
          <SourceQuote key={source.source.id} view={source} role={group.role} />
        ))}
      </Stack>
    ));
}

/** Said beside the buttons, so a past "no" or a near repeat is seen before the click, not only in the evidence. */
const cautionsOf = (view: InboxCard["derivation"], overlaps: number): ReadonlyArray<string> => [
  ...(view.despite.length > 0 ? ["You rejected something close to this"] : []),
  ...(overlaps === 1 ? ["Overlaps a near repeat"] : []),
  ...(overlaps > 1 ? [`Overlaps ${overlaps} near repeats`] : []),
];

/**
 * Everything under the actions. Expanded: the reasoning, notices, quotes and related derivations.
 * Compact: the first quote on one line, enough to recall the card without opening it.
 */
function InboxCardEvidence({
  view,
  backlog,
  expanded,
}: {
  view: InboxCard["derivation"];
  backlog: boolean;
  expanded: boolean;
}) {
  const catalog = useReviewCatalog();
  const record = view.derivation;
  if (!expanded) {
    const [first] = backlog ? [...view.supportingSources, ...view.contradictingSources] : view.supportingSources;
    return (
      first !== undefined && (
        <Text size="sm" c="dimmed" lineClamp={1} {...stylex.props(styles.shrinkable)}>
          “{first.source.quote}”
        </Text>
      )
    );
  }
  const reasoning = record.reasoning.trim();
  return (
    <>
      {reasoning !== "" && (
        <Text c="dimmed" {...stylex.props(styles.reasoning)}>
          {reasoning}
        </Text>
      )}
      {view.supersedes !== undefined && <SupersedesNotice replaces={view.supersedes} />}
      {view.despite.length > 0 && <DespiteNotice despite={view.despite} agentCase={record.despite_case} />}
      <InboxCardQuotes view={view} backlog={backlog} />
      {view.supportingDerivations.length + view.contradictingDerivations.length > 0 && (
        <Stack gap="2xs">
          {view.supportingDerivations.map((summary) => (
            <DerivationSummaryLine catalog={catalog} key={summary.id} summary={summary} note="builds on" />
          ))}
          {view.contradictingDerivations.map((summary) => (
            <DerivationSummaryLine catalog={catalog} key={summary.id} summary={summary} note="cuts against" />
          ))}
        </Stack>
      )}
    </>
  );
}

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

export function InboxProposalCard({
  card,
  kind,
  selected,
  queued,
  draft,
  known,
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
  ref?: Ref<HTMLDivElement>;
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
  // A card being worked on stays open even when another is clicked, so nothing half-done is hidden.
  const expanded = selected || engaged;

  useEffect(() => {
    onEngagedChange(engaged);
    return () => onEngagedChange(false);
  }, [engaged, onEngagedChange]);

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
  // Back to idle with nothing half-typed, so an Undo returns a clean card.
  const settleDecided = () => {
    setMode("idle");
    setRejectReason("");
    setNote("closed");
    onDecided();
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

  return (
    <Paper
      ref={ref}
      px="md"
      py="sm"
      {...(selected && { shadow: "selectedCard" })}
      onClick={onSelect}
      {...stylex.props(styles.card, selected && styles.selected)}
    >
      {selected && !engaged && !queued && (
        <SelectedCardHotkeys
          onAccept={accept}
          onReject={startReject}
          onDiscuss={() => setNote("writing")}
          onEditScope={() => setPickerOpen(true)}
        />
      )}
      <Stack gap="xs">
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
          {expanded && (
            <Text size="xs" c="dimmed" title={formatReviewTime(record.proposed_at)}>
              Proposed by {record.proposed_by} · {formatTimeAgo(record.proposed_at, nowMs)}
            </Text>
          )}
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
              {/* The group header still names the proposed scope, so say the change is this card's alone. */}
              <Text size="xs" c="dark.4">
                This one only: {changes.join(" · ") || "edited"}
              </Text>
              {mode === "idle" && !queued && (
                <Anchor component="button" size="xs" c="dimmed" onClick={() => changeDraft(undefined)}>
                  Restore
                </Anchor>
              )}
            </>
          ) : (
            expanded &&
            view.scopeSource === "defaulted" && (
              <Tooltip
                label="The proposer didn't choose a scope; Tastebud used the repo they were working in."
                withArrow
                multiline
                w={260}
              >
                <Text size="xs" c="dimmed" fs="italic">
                  Suggested from proposal context
                </Text>
              </Tooltip>
            )
          )}
        </Box>

        {mode === "idle" && queued && (
          <Group gap="xxs" wrap="nowrap">
            <Loader size={12} />
            <Text size="xs" c="dimmed">
              Queued: {kind.acceptLabel}
            </Text>
          </Group>
        )}
        {mode === "idle" && !queued && (
          <Group gap="2xs" wrap="nowrap">
            <Tooltip
              label={needsPreview ? `Review, then ${kind.acceptLabel.toLowerCase()} · A` : `${kind.acceptLabel} · A`}
              withArrow
            >
              <Button size="xs" loading={decision.pending} onClick={ignoringRepeatClicks(accept)}>
                {`${kind.acceptLabel} ${isCompleteScope(shownScope) ? scopeButtonPhrase(shownScope, known.labelOf) : ""}`.trim()}
                {needsPreview && "…"}
              </Button>
            </Tooltip>
            <Tooltip label="Reject with a reason · R" withArrow>
              <Button
                size="xs"
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
                size="xs"
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

        {expanded && <InboxNote derivationId={view.id} state={note} onStateChange={setNote} />}

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

        <InboxCardEvidence view={view} backlog={kind.recall === "never"} expanded={expanded} />
      </Stack>
    </Paper>
  );
}
