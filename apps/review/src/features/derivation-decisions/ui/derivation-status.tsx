/**
 * The derivation page's decision card: where it stands now in a sentence, what that means for agents,
 * and what the owner can do next. Every decision is a new record, so the copy keeps changing one's
 * mind cheap, and the decision just made here can be undone in place.
 */
import { Button, Group, Kbd, Paper, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivedKindView } from "@tastebud/core/kind-catalog";
import type { DerivationSummary, DerivationView } from "@tastebud/core/record-views";
import { Undo2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { formatReviewDate, formatReviewTime, formatTimeAgo } from "#review/shared/format.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DerivationStatusDot } from "#review/shared/ui/status-chips.tsx";

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

/** A pending proposal that came after this one, and the words the card notes it with. */
export interface NewerPendingVersion {
  readonly summary: DerivationSummary;
  readonly sentence: string;
  readonly link: string;
}

const isPending = (summary: DerivationSummary) => summary.status === "pending";

/**
 * A pending revision, or one proposed despite this one. The card notes it beside the decision rather
 * than leading with it: this one's own state comes first, but believing it should be done knowing.
 */
export const newerPendingVersionOf = (
  view: DerivationView,
  despitedBy: ReadonlyArray<DerivationSummary>,
): NewerPendingVersion | undefined => {
  if (view.status === "pending" || view.status === "superseded") return undefined;
  const revision = view.revisions.find(isPending);
  if (revision !== undefined)
    return { summary: revision, sentence: "A newer version is still waiting", link: "Review it" };
  const duplicate = despitedBy.find(isPending);
  if (duplicate === undefined) return undefined;
  return view.status === "accepted"
    ? { summary: duplicate, sentence: "A near-duplicate is still waiting", link: "Decide it too" }
    : { summary: duplicate, sentence: "A newer version is still waiting", link: "Review it" };
};

/** Sits directly above the verbs, so Believe is pressed knowing the newer one is there. */
function NewerVersionNotice({ newer }: { newer: NewerPendingVersion }) {
  return (
    <Text size="sm" c="dimmed">
      {newer.sentence}: “{newer.summary.statement}” ·{" "}
      <AnchorLink to="/derivations/$id" params={{ id: newer.summary.id }} size="sm">
        {newer.link}
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
  focusPrimary,
}: {
  review: DerivationReview;
  kind: DerivedKindView | undefined;
  acceptLabel: string;
  known: KnownPlaces;
  newer: NewerPendingVersion | undefined;
  focusPrimary: boolean;
}) {
  const { view, decision, undoable } = review;
  const panelsOpen = review.mode !== "idle" || decision.failure !== undefined;
  const card = useRef<HTMLDivElement>(null);
  // Arriving lands on the primary action, so Enter takes the next step.
  useEffect(() => {
    if (focusPrimary) card.current?.querySelector<HTMLElement>("[data-primary-action]")?.focus({ preventScroll: true });
  }, [focusPrimary]);
  return (
    <Paper ref={card} px="md" py="sm">
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
            {statusMeaningOf(view, kind)}
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
            <DerivationScopeRow review={review} known={known} />
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
