/**
 * The derivation page's decision card: where it stands now in a sentence, what that means for agents,
 * and what the owner can do next. Every decision is a new record, so the copy keeps changing one's
 * mind cheap, and the decision just made here can be undone in place.
 */
import { Button, Group, Paper, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import type { DerivationView } from "@tastebud/core/record-views";
import { Undo2 } from "lucide-react";

import { formatReviewDate, formatReviewTime, formatTimeAgo } from "#review/shared/format.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DerivationStatusDot } from "#review/shared/ui/status-chips.tsx";

import {
  canDecideDerivation,
  DerivationActions,
  DerivationReviewPanels,
  type DerivationReview,
} from "./derivation-review.tsx";
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
const statusMeaningOf = (view: DerivationView, kind: DerivedKindView | undefined): string => {
  if (view.retired) return "Its kind is retired, so it can't be decided any more.";
  switch (view.status) {
    case "pending":
      return "Agents aren't told this until you accept it.";
    case "accepted":
      return kind?.recall === "never"
        ? "It stays on your list; agents are never told it. You can change your mind any time."
        : "Agents get it where it applies. You can change your mind any time.";
    case "rejected":
      return "New proposals like it are checked against your reason. You can still accept it.";
    case "retracted":
      return "Agents no longer get it. You can accept it again whenever you like.";
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

/** "Rejected on Sep 16, 2026" for an older decision, "Retracted just now" for a fresh one. */
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
    </Text>
  );
}

export function DerivationStatusCard({
  review,
  kind,
  acceptLabel,
  known,
}: {
  review: DerivationReview;
  kind: DerivedKindView | undefined;
  acceptLabel: string;
  known: KnownPlaces;
}) {
  const { view, decision } = review;
  // Undo only while the decision made here is still the latest one on record.
  const undoable =
    decision.undoable !== undefined && view.decisions.at(-1)?.id === decision.undoable.decisionId
      ? decision.undoable
      : undefined;
  const panelsOpen = review.mode !== "idle" || decision.failure !== undefined;
  return (
    <Paper px="md" py="sm">
      <Stack gap="sm">
        <Group justify="space-between" align="center" wrap="nowrap" gap="lg">
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
                  onClick={() => void review.undo()}
                >
                  Undo
                </Button>
              )}
            </Group>
            {view.status === "rejected" && view.reason !== undefined && (
              <Text size="sm">Your reason: “{view.reason}”</Text>
            )}
            {view.status === "superseded" && <SupersedingRevisionLink view={view} />}
            <Text size="xs" c="dimmed">
              {statusMeaningOf(view, kind)}
            </Text>
          </Stack>
          <DerivationActions review={review} acceptLabel={acceptLabel} known={known} />
        </Group>
        {canDecideDerivation(view) && panelsOpen && (
          <DerivationReviewPanels review={review} acceptLabel={acceptLabel} known={known} />
        )}
      </Stack>
    </Paper>
  );
}
