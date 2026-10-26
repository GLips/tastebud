/**
 * Deciding from the derivation page. A pending derivation is accepted (its scope optionally amended
 * first) or rejected; an accepted one is retracted, or gets "Edit scope → propose revision", which
 * starts from where it applies now and then offers to accept that revision on the spot.
 * `useDerivationReview` holds the state; the buttons sit in the header and the panels below the facts.
 */
import { Alert, Button, Group, Stack, Text, Tooltip } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DerivationSummary, DerivationView } from "@taste/core";
import { Check, SquarePen, Undo2, X } from "lucide-react";
import { useState } from "react";

import { proposeScopeRevision } from "../server/review-functions.ts";
import type { ReviewFailure } from "../server/review-outcome.ts";
import { AcceptancePreview } from "./acceptance-preview.tsx";
import { RejectReasonForm } from "./reject-reason-form.tsx";
import { RevisionRepeatResolution } from "./revision-repeat-resolution.tsx";
import { AnchorLink } from "./router-links.tsx";
import { describeScopeChange, isSameScope, type ScopeDraft, scopeOverrideOf } from "./scope-draft.ts";
import { ScopeEditor } from "./scope-editor.tsx";
import type { KnownPlaces } from "./use-review-context.ts";
import { useReviewDecision } from "./use-review-decision.ts";

type DerivationReviewMode = "idle" | "rejecting" | "editing" | "previewing" | "revising" | "accepting-revision";

interface ScopeRevisionRequest {
  readonly scope: { scope: "global" } | { scope: "places"; places: Array<string> };
  readonly despite?: { readonly ids: ReadonlyArray<string>; readonly why: string };
}

/** "Edit scope → propose revision": a pending revision with the same words and a new scope. */
function useScopeRevision(ref: string) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<ReviewFailure | undefined>(undefined);
  const mutation = useMutation({
    mutationFn: (request: ScopeRevisionRequest) =>
      proposeScopeRevision({
        data: {
          ref,
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

/**
 * The owner's own revision, accepted without a trip to the inbox. It is still two records: the
 * revision proposed by `process:review`, and the owner's separate decision on it, made through the
 * same preview (and acknowledgements) as any accept.
 */
function OwnRevisionAcceptance({
  current,
  revision,
  acceptLabel,
  known,
  onLeave,
  onAccepted,
}: {
  current: DerivationView;
  revision: DerivationSummary;
  acceptLabel: string;
  known: KnownPlaces;
  onLeave: () => void;
  onAccepted: () => void;
}) {
  const decision = useReviewDecision(revision.id);
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(() => new Set());
  const [conflict, setConflict] = useState(false);
  const confirm = async (acknowledges: ReadonlyArray<string>) => {
    const outcome = await decision.decide({ outcome: "accept", acknowledges });
    if (outcome.ok) onAccepted();
    else if (outcome.failure.tag === "WideningNeedsAcknowledgement") setConflict(true);
  };
  return (
    <Stack gap={8}>
      <Text size="sm">
        <Text span fw={600}>
          Revision proposed.
        </Text>{" "}
        Accept it now to replace this one, or leave it in the inbox for later.
      </Text>
      {decision.failure !== undefined && decision.failure.tag !== "WideningNeedsAcknowledgement" && (
        <Alert color="red" variant="light" withCloseButton onClose={decision.clearFailure} title="Not accepted">
          {decision.failure.sentence}
        </Alert>
      )}
      <AcceptancePreview
        target={revision.id}
        statement={revision.statement}
        override={undefined}
        proposedScope={revision.proposedScope}
        changes={describeScopeChange(current.effectiveScope, revision.proposedScope, known.labelOf)}
        acceptLabel={acceptLabel}
        confirmLabel="Accept now"
        backLabel="Leave in inbox"
        active
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
        onConfirm={(acknowledges) => void confirm(acknowledges)}
        onBack={onLeave}
      />
    </Stack>
  );
}

export function useDerivationReview(view: DerivationView) {
  const decision = useReviewDecision(view.id);
  const revision = useScopeRevision(view.id);
  const [mode, setModeState] = useState<DerivationReviewMode>("idle");
  const [draft, setDraft] = useState<ScopeDraft | undefined>(undefined);
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(() => new Set());
  const [conflict, setConflict] = useState(false);
  const [acceptedRevision, setAcceptedRevision] = useState<DerivationSummary | undefined>(undefined);
  // Pending: the draft amends the proposed scope. Accepted: a revision starts from where it applies now.
  const baseScope = mode === "revising" ? view.effectiveScope : view.proposedScope;
  const setMode = (next: DerivationReviewMode) => {
    setConflict(false);
    setModeState(next);
  };
  // Acknowledgements belong to the scope they were given for: any change unchecks every box.
  const changeDraft = (next: ScopeDraft | undefined) => {
    setAcknowledged(new Set());
    setDraft(next === undefined || isSameScope(baseScope, next) ? undefined : next);
  };
  return {
    view,
    mode,
    setMode,
    decision,
    revision,
    draft,
    changeDraft,
    baseScope,
    acknowledged,
    setAcknowledged,
    conflict,
    setConflict,
    acceptedRevision,
    setAcceptedRevision,
  };
}

type DerivationReview = ReturnType<typeof useDerivationReview>;

export function DerivationActions({ review, acceptLabel }: { review: DerivationReview; acceptLabel: string }) {
  const { view, mode, setMode, decision } = review;
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
        <Button leftSection={<Check size={14} />} loading={decision.pending} onClick={() => setMode("previewing")}>
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
          <Button
            variant="default"
            leftSection={<Undo2 size={14} />}
            loading={decision.pending}
            onClick={() => void decision.decide({ outcome: "retract" })}
          >
            Retract
          </Button>
        </Tooltip>
      </Group>
    );
  return null;
}

/** The outcome alerts and whichever panel the mode opened: reject form, scope editor or preview. */
export function DerivationReviewPanels({
  review,
  acceptLabel,
  known,
}: {
  review: DerivationReview;
  acceptLabel: string;
  known: KnownPlaces;
}) {
  const { view, mode, setMode, decision, revision, draft, changeDraft, baseScope, acknowledged, acceptedRevision } =
    review;
  const shownDraft = draft ?? baseScope;
  const override = scopeOverrideOf(view.proposedScope, mode === "revising" ? undefined : draft);
  const changes = describeScopeChange(baseScope, shownDraft, known.labelOf);
  const revisionScope = mode === "revising" ? scopeOverrideOf(baseScope, draft) : undefined;
  const revisionRepeats = revision.failure?.tag === "NearRepeat" ? revision.failure.matches : undefined;
  const latestRevision = revision.revision?.ok === true ? revision.revision.value.derivation : undefined;

  const proposeRevision = async (request: ScopeRevisionRequest) => {
    const outcome = await revision.propose(request);
    if (outcome.ok) {
      setMode("accepting-revision");
      changeDraft(undefined);
    }
  };
  const confirmReject = async (reason: string) => {
    if (decision.pending) return;
    const outcome = await decision.decide({ outcome: "reject", reason });
    if (outcome.ok) setMode("idle");
  };
  const confirmAccept = async (acknowledges: ReadonlyArray<string>) => {
    const outcome = await decision.decide({ outcome: "accept", ...override, acknowledges });
    if (outcome.ok) {
      setMode("idle");
      changeDraft(undefined);
    } else if (outcome.failure.tag === "WideningNeedsAcknowledgement") review.setConflict(true);
  };

  return (
    <>
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
      {acceptedRevision !== undefined && (
        <Alert color="taste" variant="light" title="Revision accepted">
          It applies in the new scope now, and replaces this one.{" "}
          <AnchorLink to="/derivations/$id" params={{ id: acceptedRevision.id }}>
            Open the revision
          </AnchorLink>
          .
        </Alert>
      )}
      {latestRevision !== undefined && mode === "accepting-revision" && (
        <OwnRevisionAcceptance
          current={view}
          revision={latestRevision}
          acceptLabel={acceptLabel}
          known={known}
          onLeave={() => setMode("idle")}
          onAccepted={() => {
            review.setAcceptedRevision(latestRevision);
            setMode("idle");
          }}
        />
      )}
      {latestRevision !== undefined && mode !== "accepting-revision" && acceptedRevision === undefined && (
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
          active
          requireChange={mode === "revising"}
          continueLabel={(edited) =>
            mode === "revising" ? "Propose revision" : edited ? `${acceptLabel} with this scope` : acceptLabel
          }
          onDraftChange={changeDraft}
          onClose={() => {
            setMode("idle");
            if (mode === "revising") changeDraft(undefined);
          }}
          onContinue={() => {
            if (mode === "editing") {
              setMode("previewing");
              return;
            }
            if (revisionScope !== undefined) void proposeRevision({ scope: revisionScope });
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
          active
          acknowledged={acknowledged}
          onAcknowledge={(matchId, checked) => {
            const next = new Set(acknowledged);
            if (checked) next.add(matchId);
            else next.delete(matchId);
            review.setAcknowledged(next);
          }}
          conflict={review.conflict}
          pending={decision.pending}
          labels={known.labels}
          onConfirm={(acknowledges) => void confirmAccept(acknowledges)}
          onBack={() => setMode(draft === undefined ? "idle" : "editing")}
        />
      )}
    </>
  );
}
