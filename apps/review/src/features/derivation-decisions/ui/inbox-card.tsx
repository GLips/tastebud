/**
 * One pending proposal with everything needed to decide it. The card owns its own triage state
 * (rejecting, editing the scope, previewing an accept); the scope draft lives with the inbox so
 * batch accept can tell edited cards apart.
 */
import {
  Box,
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  HoverCard,
  Loader,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { InboxCard } from "@tastebud/core/inbox";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import { describeScopeChange, isCompleteScope, isSameScope, type ScopeDraft } from "@tastebud/core/places";
import type { SourceView } from "@tastebud/core/record-views";
import { MessageSquare, TriangleAlert, X } from "lucide-react";
import { type Ref, useEffect, useState } from "react";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatReviewTime, formatTimeAgo } from "#review/shared/format.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { acceptPreviewsStaleOf } from "#review/shared/query-keys.ts";
import { refreshReviewQueriesAfterWrite } from "#review/shared/refresh-after-write.ts";
import { DerivationSummaryLine, DespiteNotice, SupersedesNotice } from "#review/shared/ui/derivation-link.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink, ButtonLink } from "#review/shared/ui/router-links.tsx";
import { SourceQuote, type SourceQuoteRole } from "#review/shared/ui/source-quote.tsx";

import { AcceptancePreview } from "./acceptance-preview.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { scopeButtonPhrase, scopeOverrideOf } from "./scope-draft.ts";
import { ScopeEditor } from "./scope-editor.tsx";
import { useReviewClockMs } from "./use-review-clock.ts";
import { useReviewDecision } from "./use-review-decision.ts";

const styles = stylex.create({
  shrinkable: { minWidth: 0 },
  noWrap: { whiteSpace: "nowrap" },
  helpCursor: { cursor: "help" },
  card: {
    transitionProperty: "box-shadow, border-color",
    transitionDuration: "120ms",
    cursor: "default",
    scrollMarginTop: "96px",
    scrollMarginBottom: "24px",
  },
  selected: { borderColor: "var(--mantine-color-tastebud-4)" },
  statement: { fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.005em" },
  scopeRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minHeight: "22px" },
  quotes: { paddingTop: "2px" },
  reasoning: { whiteSpace: "pre-wrap", lineHeight: 1.45 },
  quoteGroupLabel: { letterSpacing: "0.02em" },
});

type QuoteGroup = { label: string; role: SourceQuoteRole; sources: ReadonlyArray<SourceView> };

/**
 * The quotes under a word label, so supporting and contradicting read apart without relying on the
 * quote mark's colour. A backlog kind's quotes only prompted it, so they share one label.
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
        { label: "Says the opposite", role: "contradicts", sources: view.contradictingSources },
      ];
  return groups
    .filter((group) => group.sources.length > 0)
    .map((group) => (
      <Stack key={group.label} gap="xxs" {...stylex.props(styles.quotes)}>
        <Text size="xs" c="dimmed" fw={600} tt="uppercase" {...stylex.props(styles.quoteGroupLabel)}>
          {group.label}
        </Text>
        {group.sources.map((source) => (
          <SourceQuote key={source.source.id} view={source} role={group.role} />
        ))}
      </Stack>
    ));
}

type CardMode = "idle" | "rejecting" | "editing" | "previewing";

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
  /** True while this card holds the keyboard: editing, rejecting, previewing or submitting. */
  onEngagedChange: (engaged: boolean) => void;
  onDecided: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  const nowMs = useReviewClockMs();
  const catalog = useReviewCatalog();
  const { derivation: view } = card;
  const record = view.derivation;
  const decision = useReviewDecision(view.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<CardMode>("idle");
  const [conflict, setConflict] = useState(false);
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
  const needsPreview = edited || card.needsAcknowledgement.length > 0;
  const engaged = mode !== "idle" || decision.pending;
  const backlogKind = kind.recall === "never";

  useEffect(() => {
    onEngagedChange(engaged);
    return () => onEngagedChange(false);
  }, [engaged, onEngagedChange]);

  const submitAccept = async (acknowledges: ReadonlyArray<string>) => {
    if (decision.pending) return;
    const outcome = await decision.decide({ outcome: "accept", ...override, acknowledges });
    if (outcome.ok) onDecided();
    else if (outcome.failure.tag === "WideningNeedsAcknowledgement") {
      setConflict(true);
      setMode("previewing");
      await refreshReviewQueriesAfterWrite(queryClient, acceptPreviewsStaleOf(view.id));
    }
  };
  const submitReject = async (reason: string) => {
    if (decision.pending) return;
    const outcome = await decision.decide({ outcome: "reject", reason });
    if (outcome.ok) onDecided();
  };
  const accept = () => {
    if (decision.pending || queued) return;
    if (draft !== undefined && !isCompleteScope(draft)) setMode("editing");
    else if (needsPreview) setMode("previewing");
    else void submitAccept([]);
  };
  const similarShown = new Set([view.supersedes?.id, ...view.despite.map((earlier) => earlier.id)]);
  const similar = card.related.filter((match) => !similarShown.has(match.id));
  const reasoning = record.reasoning.trim();
  // Said beside the button, so a past "no" or a near repeat is seen before the click, not only in the evidence.
  const overlaps = edited ? 0 : card.needsAcknowledgement.length;
  const cautions = [
    ...(view.despite.length > 0 ? ["You rejected something close to this"] : []),
    ...(overlaps === 1 ? ["Overlaps a near repeat"] : []),
    ...(overlaps > 1 ? [`Overlaps ${overlaps} near repeats`] : []),
  ];

  return (
    <Paper
      ref={ref}
      px="md"
      py="sm"
      {...(selected && { shadow: "selectedCard" })}
      onClick={onSelect}
      {...stylex.props(styles.card, selected && styles.selected)}
    >
      {selected && mode === "idle" && !decision.pending && !queued && (
        <SelectedCardHotkeys
          onAccept={accept}
          onReject={() => setMode("rejecting")}
          onDiscuss={() => void navigate({ to: "/derivations/$id", params: { id: view.id } })}
          onEditScope={() => setMode("editing")}
        />
      )}
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="md">
          <Stack gap="3xs" {...stylex.props(styles.shrinkable)}>
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
          {mode === "idle" && queued && (
            <Group gap="xxs" wrap="nowrap">
              <Loader size={12} />
              <Text size="xs" c="dimmed" {...stylex.props(styles.noWrap)}>
                Queued: {kind.acceptLabel}
              </Text>
            </Group>
          )}
          {mode === "idle" && !queued && (
            <Stack gap="2xs" align="flex-end">
              {cautions.length > 0 && (
                <Group gap="2xs" wrap="nowrap">
                  <TriangleAlert size={12} color="var(--mantine-color-orange-6)" aria-hidden />
                  <Text size="xs" c="orange.8" {...stylex.props(styles.noWrap)}>
                    {cautions.join(" · ")}
                  </Text>
                </Group>
              )}
              <Group gap="2xs" wrap="nowrap">
                {similar.length > 0 && (
                  <HoverCard width={380} withArrow shadow="md" position="bottom-end">
                    <HoverCard.Target>
                      <Badge variant="light" color="gray" tt="none" fw={500} {...stylex.props(styles.helpCursor)}>
                        ≈ {similar.length}
                      </Badge>
                    </HoverCard.Target>
                    <HoverCard.Dropdown>
                      <Text size="xs" c="dimmed" mb="xxs">
                        Similar {kind.plural}, any status
                      </Text>
                      <Stack gap="xxs">
                        {similar.map((match) => (
                          <DerivationSummaryLine catalog={catalog} key={match.id} summary={match} />
                        ))}
                      </Stack>
                    </HoverCard.Dropdown>
                  </HoverCard>
                )}
                <Tooltip
                  label={view.thread.length > 0 ? `Discuss (${view.thread.length}) · D` : "Discuss with an agent · D"}
                  withArrow
                >
                  <ButtonLink
                    to="/derivations/$id"
                    params={{ id: view.id }}
                    variant="subtle"
                    color="gray"
                    px="xs"
                    leftSection={<MessageSquare size={14} />}
                  >
                    {view.thread.length > 0 ? `Discuss (${view.thread.length})` : "Discuss"}
                  </ButtonLink>
                </Tooltip>
                <Tooltip label="Reject with a reason · R" withArrow>
                  <Button
                    variant="subtle"
                    color="gray"
                    px="xs"
                    leftSection={<X size={14} />}
                    onClick={() => setMode("rejecting")}
                  >
                    Reject
                  </Button>
                </Tooltip>
                <Tooltip
                  label={
                    needsPreview ? `Review, then ${kind.acceptLabel.toLowerCase()} · A` : `${kind.acceptLabel} · A`
                  }
                  withArrow
                >
                  <Button size="xs" loading={decision.pending} onClick={accept}>
                    {`${kind.acceptLabel} ${isCompleteScope(shownScope) ? scopeButtonPhrase(shownScope, known.labelOf) : ""}`.trim()}
                    {needsPreview && "…"}
                  </Button>
                </Tooltip>
              </Group>
            </Stack>
          )}
        </Group>

        {reasoning !== "" && (
          <Text c="dimmed" {...stylex.props(styles.reasoning)}>
            {reasoning}
          </Text>
        )}

        {mode !== "editing" && (
          <Box {...stylex.props(styles.scopeRow)}>
            <Text size="xs" c="dimmed">
              Applies in
            </Text>
            {isCompleteScope(shownScope) ? (
              <ScopeChips scope={shownScope} labels={known.labels} wrap="wrap" linked={mode === "idle"} />
            ) : (
              <Text size="xs" c="red.7">
                no places yet
              </Text>
            )}
            {mode === "idle" && !queued && (
              <Tooltip label="Edit where this applies · S" withArrow>
                <Anchor
                  component="button"
                  size="xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect();
                    setMode("editing");
                  }}
                >
                  Edit
                </Anchor>
              </Tooltip>
            )}
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
        )}

        {mode === "editing" && (
          <ScopeEditor
            proposed={proposed}
            draft={shownScope}
            known={known}
            active={selected}
            continueLabel={(scope) => `${kind.acceptLabel} ${scopeButtonPhrase(scope, known.labelOf)}…`}
            onDraftChange={changeDraft}
            onClose={() => setMode("idle")}
            onContinue={() => {
              setConflict(false);
              setMode("previewing");
            }}
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
            onBack={() => setMode(edited ? "editing" : "idle")}
          />
        )}

        {view.supersedes !== undefined && <SupersedesNotice replaces={view.supersedes} />}
        {view.despite.length > 0 && <DespiteNotice despite={view.despite} agentCase={record.despite_case} />}

        <InboxCardQuotes view={view} backlog={backlogKind} />
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

        {decision.failure !== undefined && decision.failure.tag !== "WideningNeedsAcknowledgement" && (
          <Alert color="red" variant="light" withCloseButton onClose={decision.clearFailure} py="xxs">
            {decision.failure.sentence}
          </Alert>
        )}

        {mode === "rejecting" && (
          <RejectReasonForm
            pending={decision.pending}
            onCancel={() => setMode("idle")}
            onSubmit={(reason) => void submitReject(reason)}
          />
        )}
      </Stack>
    </Paper>
  );
}
