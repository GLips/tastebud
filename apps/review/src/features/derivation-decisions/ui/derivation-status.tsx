/**
 * The derivation page's decision card: where it stands now in a sentence, what that means for agents,
 * and what the owner can do next. Every decision is a new record, so the copy keeps changing one's
 * mind cheap, and the decision just made here can be undone in place.
 */
import { Anchor, Button, Group, Kbd, Paper, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import type { DerivationSummary, DerivationView } from "@tastebud/core/record-views";
import { Undo2 } from "lucide-react";

import { formatReviewDate, formatReviewTime, formatTimeAgo } from "#review/shared/format.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DerivationStatusDot } from "#review/shared/ui/status-chips.tsx";

import { acceptItPhrase } from "./accept-wording.ts";
import { DerivationActions, DerivationReviewPanels, DerivationScopeRow } from "./derivation-review.tsx";
import { canDecideDerivation, type DerivationReview } from "./use-derivation-review.ts";
import { useReviewClockMs } from "./use-review-clock.ts";

const styles = stylex.create({
  shrinkable: { minWidth: 0 },
});

const STATUS_HEADLINES: Record<DerivationView["status"], string> = {
  pending: "Waiting for your decision",
  accepted: "Accepted",
  rejected: "Rejected",
  retracted: "Retracted",
  superseded: "Replaced by a newer revision",
};

/** What the status means for agents, in a line, and that the owner can still change it. */
const statusMeaningOf = (view: DerivationView, kind: DerivedKindView | undefined, acceptLabel: string): string => {
  if (view.retired) return "Its kind is retired, so it can't be decided any more.";
  const acceptIt = acceptItPhrase(acceptLabel);
  switch (view.status) {
    case "pending":
      return kind?.recall === "never"
        ? `It joins your list once you ${acceptIt}; agents are never told it.`
        : `Agents aren't told this until you ${acceptIt}.`;
    case "accepted":
      return kind?.recall === "never"
        ? "It stays on your list; agents are never told it. You can change your mind any time."
        : "Agents get it where it applies. You can change your mind any time.";
    case "rejected":
      return `New proposals like it are checked against your reason. You can still ${acceptIt}.`;
    case "retracted":
      return `Agents no longer get it. You can ${acceptIt} again whenever you like.`;
    case "superseded":
      return "Its revision applies in its place. To change your mind, decide on the revision.";
  }
};

function SupersedingRevisionLink({ view }: { view: DerivationView }) {
  const revision = view.revisions.find((summary) => summary.status === "accepted");
  if (revision === undefined) return null;
  return (
    <Text size="sm">
      Replaced by{" "}
      <AnchorLink to="/derivations/$id" params={{ id: revision.id }}>
        “{revision.statement}”
      </AnchorLink>
    </Text>
  );
}

/**
 * "Rejected on Sep 16, 2026 — “only web has a UI”" for an older decision, "Retracted just now" for a
 * fresh one. A rejection carries its reason in the same sentence.
 */
function StatusSentence({ view }: { view: DerivationView }) {
  const nowMs = useReviewClockMs();
  const ago = formatTimeAgo(view.decidedAt, nowMs);
  const dated = view.decidedAt !== undefined && view.status !== "pending" && view.status !== "superseded";
  const preposition = ago === formatReviewDate(view.decidedAt) ? " on " : " ";
  const when = dated ? `${preposition}${ago}` : "";
  return (
    <Text fw={600} title={formatReviewTime(view.decidedAt)}>
      {STATUS_HEADLINES[view.status]}
      {when}
      {view.status === "rejected" && view.reason !== undefined && (
        <Text span fw={400}>
          {" — "}“{view.reason}”
        </Text>
      )}
    </Text>
  );
}

const isPending = (summary: DerivationSummary) => summary.status === "pending";

/**
 * A pending revision, or one proposed despite this one, if any. The card notes it beside the decision
 * rather than leading with it: this one's own state comes first, but believing it should be done knowing.
 */
export const newerPendingVersionOf = (
  view: DerivationView,
  despitedBy: ReadonlyArray<DerivationSummary>,
): DerivationSummary | undefined =>
  view.status === "pending" || view.status === "superseded"
    ? undefined
    : [...view.revisions, ...despitedBy].find(isPending);

/** Sits directly above the verbs. One wording whether it revises this one or was proposed despite it. */
function NewerVersionNotice({ newer }: { newer: DerivationSummary }) {
  return (
    <Text size="sm" c="dimmed">
      A newer version is waiting: “{newer.statement}” ·{" "}
      <AnchorLink to="/derivations/$id" params={{ id: newer.id }} size="sm">
        Review it
      </AnchorLink>
    </Text>
  );
}

export function DerivationStatusCard({
  review,
  kind,
  acceptLabel,
  known,
  newer,
}: {
  review: DerivationReview;
  kind: DerivedKindView | undefined;
  acceptLabel: string;
  known: KnownPlaces;
  newer: DerivationSummary | undefined;
}) {
  const { view, decision, undoable } = review;
  const panelsOpen = review.mode !== "idle" || decision.failure !== undefined;
  // A rejection can be restated; quiet, because it is a second rejection, not a change of mind.
  const canChangeReason = view.status === "rejected" && review.mode === "idle" && canDecideDerivation(view);
  return (
    <Paper px="md" py="sm">
      <Stack gap="sm">
        <Stack gap="3xs" {...stylex.props(styles.shrinkable)}>
          <Group gap="xs" wrap="nowrap">
            <DerivationStatusDot status={view.status} />
            <StatusSentence view={view} />
            {undoable !== undefined && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<Undo2 size={12} />}
                loading={decision.pending}
                rightSection={<Kbd size="xs">U</Kbd>}
                onClick={review.undo}
              >
                Undo
              </Button>
            )}
          </Group>
          {view.status === "superseded" && <SupersedingRevisionLink view={view} />}
          <Text size="xs" c="dimmed">
            {statusMeaningOf(view, kind, acceptLabel)}
            {canChangeReason && (
              <>
                {" · "}
                <Anchor component="button" size="xs" onClick={review.changeReason}>
                  Change the reason
                </Anchor>
              </>
            )}
          </Text>
        </Stack>
        {newer !== undefined && <NewerVersionNotice newer={newer} />}
        {!canDecideDerivation(view) && (
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              {view.status === "pending" || view.status === "rejected" ? "Proposed for" : "Applied in"}
            </Text>
            <ScopeChips scope={view.effectiveScope} labels={known.labels} wrap="wrap" />
          </Group>
        )}
        {canDecideDerivation(view) && (
          <Group justify="space-between" align="center" gap="sm">
            <DerivationScopeRow review={review} acceptLabel={acceptLabel} known={known} />
            <DerivationActions review={review} acceptLabel={acceptLabel} />
          </Group>
        )}
        {canDecideDerivation(view) && panelsOpen && (
          <DerivationReviewPanels review={review} acceptLabel={acceptLabel} known={known} />
        )}
      </Stack>
    </Paper>
  );
}
