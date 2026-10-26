/**
 * One pending proposal with everything needed to decide it. The card owns its own triage state
 * (rejecting, editing the scope, previewing an accept); the scope draft lives with the inbox so
 * batch accept can tell edited cards apart.
 */
import {
  ActionIcon,
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
import type { InboxCard } from "@taste/core";
import type { DerivedKindView } from "@taste/core/catalog-view";
import { MessageSquare, TriangleAlert, X } from "lucide-react";
import { type Ref, useEffect, useState } from "react";

import { AcceptancePreview } from "./acceptance-preview.tsx";
import { DerivationSummaryLine, DespiteNotice, SupersedesNotice } from "./derivation-link.tsx";
import { formatReviewTime, formatTimeAgo } from "./format.ts";
import { ScopeChips } from "./place-chips.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { AnchorLink, ButtonLink } from "./router-links.tsx";
import { describeScopeChange, isCompleteScope, isSameScope, type ScopeDraft, scopeOverrideOf } from "./scope-draft.ts";
import { ScopeEditor } from "./scope-editor.tsx";
import { SourceQuote } from "./source-quote.tsx";
import type { KnownPlaces } from "./use-review-context.ts";
import { useReviewDecision } from "./use-review-decision.ts";

const styles = stylex.create({
  card: {
    transitionProperty: "box-shadow, border-color",
    transitionDuration: "120ms",
    cursor: "default",
    scrollMarginTop: "96px",
    scrollMarginBottom: "24px",
  },
  selected: {
    borderColor: "var(--mantine-color-taste-4)",
    boxShadow: "0 0 0 3px var(--mantine-color-taste-1)",
  },
  statement: { fontSize: "15px", fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.005em" },
  scopeRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minHeight: "22px" },
  quotes: { paddingTop: "2px" },
});

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
      await queryClient.invalidateQueries({ queryKey: ["accept-preview", view.id] });
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
  const sources = [...view.supportingSources, ...view.contradictingSources];

  return (
    <Paper ref={ref} px="md" py="sm" onClick={onSelect} {...stylex.props(styles.card, selected && styles.selected)}>
      {selected && mode === "idle" && !decision.pending && !queued && (
        <SelectedCardHotkeys
          onAccept={accept}
          onReject={() => setMode("rejecting")}
          onDiscuss={() => void navigate({ to: "/derivations/$id", params: { id: view.id } })}
          onEditScope={() => setMode("editing")}
        />
      )}
      <Stack gap={8}>
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="md">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <AnchorLink
              to="/derivations/$id"
              params={{ id: view.id }}
              c="inherit"
              underline="never"
              {...stylex.props(styles.statement)}
            >
              {view.statement}
            </AnchorLink>
            <Text size="xs" c="dimmed" lineClamp={1} title={reasoning === "" ? undefined : reasoning}>
              <span title={formatReviewTime(record.proposed_at)}>
                {record.proposed_by} · {formatTimeAgo(record.proposed_at)}
              </span>
              {reasoning !== "" && ` — ${reasoning}`}
            </Text>
          </Stack>
          {mode === "idle" && queued && (
            <Group gap={6} wrap="nowrap">
              <Loader size={12} />
              <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                Queued: {kind.acceptLabel}
              </Text>
            </Group>
          )}
          {mode === "idle" && !queued && (
            <Group gap={4} wrap="nowrap">
              {similar.length > 0 && (
                <HoverCard width={380} withArrow shadow="md" position="bottom-end">
                  <HoverCard.Target>
                    <Badge variant="light" color="gray" tt="none" fw={500} style={{ cursor: "help" }}>
                      ≈ {similar.length}
                    </Badge>
                  </HoverCard.Target>
                  <HoverCard.Dropdown>
                    <Text size="xs" c="dimmed" mb={6}>
                      Similar {kind.plural}, any status
                    </Text>
                    <Stack gap={6}>
                      {similar.map((match) => (
                        <DerivationSummaryLine key={match.id} summary={match} />
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
                  size="compact-sm"
                  px={6}
                  leftSection={<MessageSquare size={15} />}
                  aria-label="Discuss"
                >
                  {view.thread.length > 0 ? view.thread.length : null}
                </ButtonLink>
              </Tooltip>
              <Tooltip label="Reject · R" withArrow>
                <ActionIcon variant="default" size="md" aria-label="Reject" onClick={() => setMode("rejecting")}>
                  <X size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip
                label={needsPreview ? `Review, then ${kind.acceptLabel.toLowerCase()} · A` : `${kind.acceptLabel} · A`}
                withArrow
              >
                <Button size="xs" loading={decision.pending} onClick={accept}>
                  {needsPreview ? `${kind.acceptLabel}…` : kind.acceptLabel}
                </Button>
              </Tooltip>
            </Group>
          )}
        </Group>

        {mode !== "editing" && (
          <div {...stylex.props(styles.scopeRow)}>
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
                  label="The proposer didn't choose a scope; Taste used the repo they were working in."
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
            {card.needsAcknowledgement.length > 0 && !edited && (
              <Group gap={4} wrap="nowrap">
                <TriangleAlert size={12} color="var(--mantine-color-orange-6)" />
                <Text size="xs" c="orange.8">
                  Overlaps{" "}
                  {card.needsAcknowledgement.length === 1
                    ? "a near repeat"
                    : `${card.needsAcknowledgement.length} near repeats`}
                </Text>
              </Group>
            )}
          </div>
        )}

        {mode === "editing" && (
          <ScopeEditor
            proposed={proposed}
            draft={shownScope}
            known={known}
            active={selected}
            continueLabel={(changed) => (changed ? `${kind.acceptLabel} with this scope` : kind.acceptLabel)}
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
            acceptLabel={kind.acceptLabel}
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

        {sources.length > 0 && (
          <Stack gap={6} {...stylex.props(styles.quotes)}>
            {backlogKind && (
              <Text size="xs" c="dimmed">
                What prompted this
              </Text>
            )}
            {view.supportingSources.map((source) => (
              <SourceQuote key={source.source.id} view={source} role={backlogKind ? "prompted" : "supports"} />
            ))}
            {view.contradictingSources.map((source) => (
              <SourceQuote key={source.source.id} view={source} role={backlogKind ? "plain" : "contradicts"} />
            ))}
          </Stack>
        )}
        {view.supportingDerivations.length + view.contradictingDerivations.length > 0 && (
          <Stack gap={4}>
            {view.supportingDerivations.map((summary) => (
              <DerivationSummaryLine key={summary.id} summary={summary} note="builds on" />
            ))}
            {view.contradictingDerivations.map((summary) => (
              <DerivationSummaryLine key={summary.id} summary={summary} note="cuts against" />
            ))}
          </Stack>
        )}

        {decision.failure !== undefined && decision.failure.tag !== "WideningNeedsAcknowledgement" && (
          <Alert color="red" variant="light" withCloseButton onClose={decision.clearFailure} py={6}>
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
