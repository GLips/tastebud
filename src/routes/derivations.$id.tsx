import {
  Alert,
  Button,
  Center,
  CopyButton,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Timeline,
  Title,
  Tooltip,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, SquarePen, Undo2, X } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { DecisionRecord, DerivationSummary, DerivationView } from "../core/index.ts";
import { proposeScopeRevision } from "../server/review-functions.ts";
import type { ReviewFailure } from "../server/review-outcome.ts";
import { shortIdOf } from "../shared/vocabulary.ts";
import { AcceptancePreview } from "../ui/acceptance-preview.tsx";
import { DerivationSummaryLine, DespiteNotice, SupersedesNotice } from "../ui/derivation-link.tsx";
import { DerivationThread } from "../ui/derivation-thread.tsx";
import { describeAuthor, formatReviewTime, formatTimeAgo } from "../ui/format.ts";
import { capitalize, findKindView, KindGlyph } from "../ui/kind-identity.tsx";
import { ScopeChips } from "../ui/place-chips.tsx";
import { RejectReasonForm } from "../ui/reject-reason-form.tsx";
import { recordDetailQuery } from "../ui/review-queries.ts";
import { RevisionRepeatResolution } from "../ui/revision-repeat-resolution.tsx";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { AnchorLink, ButtonLink } from "../ui/router-links.tsx";
import { describeScopeChange, isSameScope, type ScopeDraft, scopeOverrideOf } from "../ui/scope-draft.ts";
import { ScopeEditor } from "../ui/scope-editor.tsx";
import { SourceQuote } from "../ui/source-quote.tsx";
import { type KnownPlaces, useKnownPlaces, useReviewCatalog } from "../ui/use-review-context.ts";
import { useReviewDecision } from "../ui/use-review-decision.ts";

export const Route = createFileRoute("/derivations/$id")({ component: DerivationScreen });

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) 300px",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    gap: "20px",
    alignItems: "start",
  },
  single: { gridTemplateColumns: "minmax(0, 1fr)" },
  statement: { fontSize: "22px", lineHeight: 1.3, letterSpacing: "-0.015em", fontWeight: 650, textWrap: "balance" },
  prose: { whiteSpace: "pre-wrap" },
  current: { fontWeight: 600 },
  id: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: "11px", cursor: "copy" },
  facts: {
    display: "grid",
    gridTemplateColumns: "88px minmax(0, 1fr)",
    columnGap: "12px",
    rowGap: "6px",
    alignItems: "center",
  },
});

type DetailMode = "idle" | "rejecting" | "editing" | "previewing" | "revising";

function ChainLink({ summary, current }: { summary: DerivationSummary; current: boolean }) {
  return current ? (
    <Text size="sm" {...stylex.props(styles.current)}>
      This revision · {summary.status}
    </Text>
  ) : (
    <DerivationSummaryLine summary={summary} />
  );
}

const DECISION_BULLET_COLORS: Record<DecisionRecord["outcome"], string> = {
  accept: "taste",
  reject: "red",
  retract: "gray",
};

// Timeline marks items active by cloning its direct children, so the Timeline.Item stays at the call site.
function DecisionEntryBody({ entry, owner, known }: { entry: DecisionRecord; owner: string; known: KnownPlaces }) {
  return (
    <>
      <Text size="xs" c="dimmed">
        {describeAuthor(entry.by, owner)}
        {entry.via !== undefined && ` via ${entry.via}`} · {formatReviewTime(entry.at)}
      </Text>
      {entry.scope !== undefined && (
        <Group gap={4} mt={4}>
          <Text size="xs" c="dimmed">
            with scope
          </Text>
          <ScopeChips
            scope={entry.scope === "global" ? { scope: "global" } : { scope: "places", places: entry.places ?? [] }}
            labels={known.labels}
            wrap="wrap"
          />
        </Group>
      )}
      {entry.acknowledges !== undefined && (
        <Text size="xs" c="dimmed" mt={2}>
          Acknowledged {entry.acknowledges.length} near {entry.acknowledges.length === 1 ? "repeat" : "repeats"}
        </Text>
      )}
      {entry.reason !== undefined && <Text size="sm">“{entry.reason}”</Text>}
    </>
  );
}

function SidebarList({ title, items }: { title: string; items: ReadonlyArray<DerivationSummary> }) {
  if (items.length === 0) return null;
  return (
    <Paper p="md">
      <Text size="sm" fw={600} mb="sm">
        {title}
      </Text>
      <Stack gap={6}>
        {items.map((item) => (
          <DerivationSummaryLine key={item.id} summary={item} />
        ))}
      </Stack>
    </Paper>
  );
}

interface ScopeRevisionRequest {
  readonly scope: { scope: "global" } | { scope: "places"; places: Array<string> };
  readonly despite?: { readonly ids: ReadonlyArray<string>; readonly why: string };
}

/** "Edit scope → propose revision": a pending revision with the same words and a new scope. */
function useScopeRevision(target: string) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<ReviewFailure | undefined>(undefined);
  const mutation = useMutation({
    mutationFn: (request: ScopeRevisionRequest) =>
      proposeScopeRevision({
        data: {
          ref: target,
          ...request.scope,
          ...(request.despite !== undefined && {
            despite: [...request.despite.ids],
            despite_case: request.despite.why,
          }),
        },
      }),
    onMutate: () => setFailure(undefined),
    onSuccess: (outcome) => setFailure(outcome.ok ? undefined : outcome.failure),
    onSettled: () => queryClient.invalidateQueries(),
  });
  return {
    propose: mutation.mutateAsync,
    pending: mutation.isPending,
    failure,
    clearFailure: () => setFailure(undefined),
    revision: mutation.data,
  };
}

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <div>{children}</div>
    </>
  );
}

function DerivationActions({
  view,
  mode,
  setMode,
  acceptLabel,
  decisionPending,
  onAccept,
  onRetract,
}: {
  view: DerivationView;
  mode: DetailMode;
  setMode: (mode: DetailMode) => void;
  acceptLabel: string;
  decisionPending: boolean;
  onAccept: () => void;
  onRetract: () => void;
}) {
  if (mode !== "idle" || view.retired) return null;
  if (view.status === "pending")
    return (
      <Group gap={6} wrap="nowrap">
        <Button variant="default" leftSection={<X size={14} />} onClick={() => setMode("rejecting")}>
          Reject
        </Button>
        <Button variant="default" leftSection={<SquarePen size={14} />} onClick={() => setMode("editing")}>
          Edit scope
        </Button>
        <Button leftSection={<Check size={14} />} loading={decisionPending} onClick={onAccept}>
          {acceptLabel}…
        </Button>
      </Group>
    );
  if (view.status === "accepted")
    return (
      <Group gap={6} wrap="nowrap">
        <Tooltip label="Proposes a revision with a new scope; it replaces this one once you accept it" withArrow>
          <Button variant="default" leftSection={<SquarePen size={14} />} onClick={() => setMode("revising")}>
            Edit scope
          </Button>
        </Tooltip>
        <Tooltip label="Agents stop recalling it; its history stays" withArrow position="bottom-end">
          <Button variant="default" leftSection={<Undo2 size={14} />} loading={decisionPending} onClick={onRetract}>
            Retract
          </Button>
        </Tooltip>
      </Group>
    );
  return null;
}

function DerivationScreen() {
  const { id } = Route.useParams();
  const detail = useQuery(recordDetailQuery(id));
  const catalog = useReviewCatalog();
  const decision = useReviewDecision(id);
  const revision = useScopeRevision(id);
  const [mode, setMode] = useState<DetailMode>("idle");
  const [draft, setDraft] = useState<ScopeDraft | undefined>(undefined);
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  const [conflict, setConflict] = useState(false);
  const view = detail.data?.derivation;
  const known = useKnownPlaces(
    view === undefined ? [] : [...placesOf(view.proposedScope), ...placesOf(view.effectiveScope)],
  );

  if (detail.error) return <QueryErrorAlert error={detail.error} />;
  if (detail.data === undefined) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }
  if (view === undefined) {
    return (
      <Alert color="gray" title="Not a derivation">
        This record is a {detail.data.record.type}.{" "}
        {detail.data.record.type === "Source" && (
          <AnchorLink to="/sources/$id" params={{ id: detail.data.record.id }}>
            Open it as a source
          </AnchorLink>
        )}
      </Alert>
    );
  }

  const owner = catalog?.owner ?? "";
  const kind = findKindView(catalog, view.kind);
  const acceptLabel = kind?.acceptLabel ?? "Accept";
  const backlogKind = kind?.recall === "never";
  const record = view.derivation;
  const chain: Array<DerivationSummary> = [...view.ancestors, view, ...view.revisions];
  const amended = !isSameScope(view.proposedScope, view.effectiveScope);
  // Pending: the draft amends the proposed scope. Accepted: a revision starts from where it applies now.
  const baseScope = mode === "revising" ? view.effectiveScope : view.proposedScope;
  const shownDraft = draft ?? baseScope;
  const override = scopeOverrideOf(view.proposedScope, mode === "revising" ? undefined : draft);
  const changes = describeScopeChange(baseScope, shownDraft, known.labelOf);
  const hasSidebar =
    view.decisions.length > 0 ||
    chain.length > 1 ||
    detail.data.citedBy.length + detail.data.despitedBy.length + detail.data.acknowledgedBy.length > 0;
  const sources = view.supportingSources.length + view.contradictingSources.length;

  const proposeRevision = async (request: ScopeRevisionRequest) => {
    const outcome = await revision.propose(request);
    if (outcome.ok) {
      setMode("idle");
      setDraft(undefined);
    }
  };
  const confirmReject = async (reason: string) => {
    const outcome = await decision.decide({ outcome: "reject", reason });
    if (outcome.ok) setMode("idle");
  };
  const confirmAccept = async (acknowledges: ReadonlyArray<string>) => {
    const outcome = await decision.decide({ outcome: "accept", ...override, acknowledges });
    if (outcome.ok) {
      setMode("idle");
      setDraft(undefined);
    } else if (outcome.failure.tag === "WideningNeedsAcknowledgement") setConflict(true);
  };
  const backFromPreview = () =>
    setMode(draft !== undefined && !isSameScope(view.proposedScope, draft) ? "editing" : "idle");
  const revisionScope = mode === "revising" ? scopeOverrideOf(baseScope, draft) : undefined;
  const revisionRepeats = revision.failure?.tag === "NearRepeat" ? revision.failure.matches : undefined;
  const latestRevision = revision.revision?.ok === true ? revision.revision.value.derivation : undefined;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <AnchorLink to="/kinds/$kind" params={{ kind: view.kind }} size="sm" c="dimmed" underline="hover">
          <Group gap={4}>
            <ArrowLeft size={14} />
            {capitalize(kind?.plural ?? view.kind)}
          </Group>
        </AnchorLink>
        <CopyButton value={view.id}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? "Copied" : "Copy the id for the CLI"} withArrow>
              <Text c="dimmed" onClick={copy} {...stylex.props(styles.id)}>
                {shortIdOf(view.id)}
              </Text>
            </Tooltip>
          )}
        </CopyButton>
      </Group>

      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="lg">
        <Stack gap={6} style={{ minWidth: 0 }}>
          <Group gap={6}>
            <KindGlyph catalog={catalog} kind={view.kind} />
            <Text size="sm" fw={500} c="dark.4">
              {capitalize(view.kindLabel)}
              {view.retired && " (retired kind)"}
            </Text>
            <Text size="sm" c="dimmed">
              ·
            </Text>
            <Text size="sm" c="dimmed" tt="capitalize">
              {view.status}
            </Text>
            {view.subject !== undefined && view.subject !== "owner" && view.subject !== owner && (
              <Text size="sm" c="dimmed">
                · about {view.subject}
              </Text>
            )}
          </Group>
          <Title order={2} {...stylex.props(styles.statement)}>
            {view.statement}
          </Title>
          <Text size="xs" c="dimmed">
            <span title={formatReviewTime(record.proposed_at)}>
              {record.proposed_by} · {formatTimeAgo(record.proposed_at)}
            </span>
            {record.reasoning.trim() !== "" && (
              <span {...stylex.props(styles.prose)}> — {record.reasoning.trim()}</span>
            )}
          </Text>
        </Stack>
        <DerivationActions
          view={view}
          mode={mode}
          setMode={(next) => {
            setConflict(false);
            setMode(next);
          }}
          acceptLabel={acceptLabel}
          decisionPending={decision.pending}
          onAccept={() => setMode("previewing")}
          onRetract={() => void decision.decide({ outcome: "retract" })}
        />
      </Group>

      <Paper px="md" py="sm">
        <div {...stylex.props(styles.facts)}>
          <FactRow label={view.status === "pending" ? "Proposed for" : "Applies in"}>
            <Group gap={8}>
              <ScopeChips scope={view.effectiveScope} labels={known.labels} wrap="wrap" />
              {view.status === "pending" && view.scopeSource === "defaulted" && (
                <Text size="xs" c="dimmed" fs="italic">
                  Suggested from proposal context
                </Text>
              )}
            </Group>
          </FactRow>
          {amended && (
            <FactRow label="Proposed">
              <Group gap={8}>
                <ScopeChips scope={view.proposedScope} labels={known.labels} wrap="wrap" />
                <Text size="xs" c="dimmed">
                  amended when accepted
                </Text>
              </Group>
            </FactRow>
          )}
        </div>
      </Paper>

      {decision.failure !== undefined && decision.failure.tag !== "WideningNeedsAcknowledgement" && (
        <Alert color="red" variant="light" withCloseButton onClose={decision.clearFailure} title="Not decided">
          {decision.failure.sentence}
        </Alert>
      )}
      {revision.failure !== undefined && revisionRepeats === undefined && (
        <Alert color="red" variant="light" title="No revision proposed">
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {revision.failure.sentence}
          </Text>
        </Alert>
      )}
      {latestRevision !== undefined && (
        <Alert color="taste" variant="light" title="Revision proposed">
          It applies in the new scope once you accept it.{" "}
          <AnchorLink to="/derivations/$id" params={{ id: latestRevision.id }}>
            Review the revision
          </AnchorLink>{" "}
          or{" "}
          <AnchorLink to="/" search={{ kind: view.kind }}>
            open the inbox
          </AnchorLink>
          .
        </Alert>
      )}

      {mode === "rejecting" && (
        <RejectReasonForm
          pending={decision.pending}
          onCancel={() => setMode("idle")}
          onSubmit={(reason) => void confirmReject(reason)}
        />
      )}
      {mode === "revising" && revisionRepeats !== undefined && revisionScope !== undefined && (
        <RevisionRepeatResolution
          scope={revisionScope}
          matches={revisionRepeats}
          labels={known.labels}
          pending={revision.pending}
          onCancel={revision.clearFailure}
          onPropose={(ids, why) => void proposeRevision({ scope: revisionScope, despite: { ids, why } })}
        />
      )}
      {(mode === "editing" || (mode === "revising" && revisionRepeats === undefined)) && (
        <ScopeEditor
          proposed={baseScope}
          draft={shownDraft}
          known={known}
          requireChange={mode === "revising"}
          continueLabel={(edited) =>
            mode === "revising" ? "Propose revision" : edited ? `${acceptLabel} with this scope` : acceptLabel
          }
          onDraftChange={(next) => setDraft(isSameScope(baseScope, next) ? undefined : next)}
          onClose={() => {
            setMode("idle");
            if (mode === "revising") setDraft(undefined);
          }}
          onContinue={() => {
            if (mode === "editing") {
              setConflict(false);
              setMode("previewing");
              return;
            }
            const next = scopeOverrideOf(baseScope, draft);
            if (next === undefined) return;
            void proposeRevision({ scope: next });
          }}
        />
      )}
      {mode === "previewing" && (
        <AcceptancePreview
          target={view.id}
          statement={view.statement}
          override={override}
          proposedScope={view.proposedScope}
          changes={changes}
          acceptLabel={acceptLabel}
          acknowledged={acknowledged}
          onAcknowledge={(matchId, checked) => {
            const next = new Set(acknowledged);
            if (checked) next.add(matchId);
            else next.delete(matchId);
            setAcknowledged(next);
          }}
          conflict={conflict}
          pending={decision.pending}
          labels={known.labels}
          onConfirm={(acknowledges) => void confirmAccept(acknowledges)}
          onBack={backFromPreview}
        />
      )}

      <div {...stylex.props(styles.layout, !hasSidebar && styles.single)}>
        <Stack gap="md">
          {(view.supersedes !== undefined || view.despite.length > 0) && (
            <Stack gap={8}>
              {view.supersedes !== undefined && <SupersedesNotice replaces={view.supersedes} />}
              {view.despite.length > 0 && <DespiteNotice despite={view.despite} agentCase={record.despite_case} />}
            </Stack>
          )}

          {sources + view.supportingDerivations.length + view.contradictingDerivations.length > 0 && (
            <Paper px="md" py="sm">
              <Stack gap={8}>
                {backlogKind && (
                  <Text size="xs" c="dimmed">
                    What prompted this
                  </Text>
                )}
                {view.supportingSources.map((source) => (
                  <SourceQuote
                    key={source.source.id}
                    view={source}
                    role={backlogKind ? "prompted" : "supports"}
                    showKind
                  />
                ))}
                {view.contradictingSources.map((source) => (
                  <SourceQuote
                    key={source.source.id}
                    view={source}
                    role={backlogKind ? "plain" : "contradicts"}
                    showKind
                  />
                ))}
                {view.supportingDerivations.map((summary) => (
                  <DerivationSummaryLine key={summary.id} summary={summary} note="builds on" />
                ))}
                {view.contradictingDerivations.map((summary) => (
                  <DerivationSummaryLine key={summary.id} summary={summary} note="cuts against" />
                ))}
              </Stack>
            </Paper>
          )}

          <Paper p="md">
            <DerivationThread
              derivationId={view.id}
              thread={view.thread}
              owner={owner}
              listeners={detail.data.listeners}
            />
          </Paper>
        </Stack>

        {hasSidebar && (
          <Stack gap="md">
            {view.decisions.length > 0 && (
              <Paper p="md">
                <Text size="sm" fw={600} mb="sm">
                  Decisions
                </Text>
                <Timeline bulletSize={10} lineWidth={2} active={view.decisions.length - 1}>
                  {view.decisions.map((entry) => (
                    <Timeline.Item
                      key={entry.id}
                      color={DECISION_BULLET_COLORS[entry.outcome]}
                      title={
                        <Text size="sm" fw={600} tt="capitalize">
                          {entry.outcome}
                        </Text>
                      }
                    >
                      <DecisionEntryBody entry={entry} owner={owner} known={known} />
                    </Timeline.Item>
                  ))}
                </Timeline>
              </Paper>
            )}
            {chain.length > 1 && (
              <Paper p="md">
                <Text size="sm" fw={600} mb="sm">
                  Revisions
                </Text>
                <Timeline bulletSize={10} lineWidth={2} active={view.ancestors.length}>
                  {chain.map((summary) => (
                    <Timeline.Item key={summary.id}>
                      <ChainLink summary={summary} current={summary.id === view.id} />
                    </Timeline.Item>
                  ))}
                </Timeline>
              </Paper>
            )}
            <SidebarList title="Cited by" items={detail.data.citedBy} />
            <SidebarList title="Proposed again despite this" items={detail.data.despitedBy} />
            <SidebarList title="Accepted despite this" items={detail.data.acknowledgedBy} />
          </Stack>
        )}
      </div>
      {view.status === "pending" && (
        <Group>
          <ButtonLink to="/" search={{ kind: view.kind }} variant="subtle" color="gray" size="xs">
            Back to the inbox
          </ButtonLink>
        </Group>
      )}
    </Stack>
  );
}

const placesOf = (scope: DerivationView["proposedScope"]) => (scope.scope === "global" ? [] : scope.places);
