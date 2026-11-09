/** One scope's section of the inbox queue: the place as its title, how many wait there, then the rows. */
import { Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import type { DerivationScope } from "@tastebud/core/places";
import { Globe } from "lucide-react";
import type { ReactNode } from "react";

import { recordDetailQuery } from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { PlaceFormIcon } from "#review/shared/ui/place-chips.tsx";
import { ButtonLink } from "#review/shared/ui/router-links.tsx";

import type { InboxQueueEntry } from "./inbox-queue.ts";

const styles = stylex.create({
  shrinkable: { minWidth: 0 },
  count: { fontVariantNumeric: "tabular-nums" },
  groupHeader: {
    position: "sticky",
    top: "var(--review-shell-header-height)",
    zIndex: 5,
    paddingTop: "12px",
    paddingBottom: "6px",
    backgroundColor: "var(--mantine-color-gray-0)",
  },
  gone: { borderStyle: "dashed", backgroundColor: "var(--mantine-color-gray-0)" },
});

/** The group's scope as a section title: the place names themselves, not chips. */
function ScopeTitle({ scope, known }: { scope: DerivationScope; known: KnownPlaces }) {
  if (scope.scope === "global") {
    return (
      <Group gap="xxs" wrap="nowrap">
        <Globe size={16} aria-hidden />
        <Title order={4}>Everywhere</Title>
      </Group>
    );
  }
  return (
    <Group gap="xs" wrap="wrap">
      {scope.places.map((place, index) => (
        <Group key={place} gap="xxs" wrap="nowrap">
          {index > 0 && (
            <Text c="dimmed" fw={600}>
              +
            </Text>
          )}
          <PlaceFormIcon place={place} size={16} />
          <Title order={4}>{known.labelOf(place)}</Title>
        </Group>
      ))}
    </Group>
  );
}

/** A card someone decided in another tab or process: kept in place so the queue doesn't jump. */
export function GoneProposalRow({ entry, onContinue }: { entry: InboxQueueEntry; onContinue: () => void }) {
  const detail = useQuery(recordDetailQuery(entry.id));
  const status = detail.data?.derivation?.status;
  return (
    <Paper px="md" py="sm" {...stylex.props(styles.gone)}>
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Stack gap="3xs" {...stylex.props(styles.shrinkable)}>
          <Text size="sm" c="dimmed" td="line-through" truncate>
            {entry.card.derivation.statement}
          </Text>
          <Text size="xs" c="dimmed">
            {status === undefined || status === "pending" ? "No longer pending" : `Already ${status} elsewhere`}
          </Text>
        </Stack>
        <Group gap="xxs" wrap="nowrap">
          <ButtonLink to="/derivations/$id" params={{ id: entry.id }} variant="subtle" color="gray" size="xs">
            View decision
          </ButtonLink>
          <Button size="xs" variant="default" onClick={onContinue}>
            Continue
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}

export function InboxGroupSection({
  scope,
  entries,
  known,
  renderEntry,
}: {
  scope: DerivationScope;
  entries: ReadonlyArray<InboxQueueEntry>;
  known: KnownPlaces;
  renderEntry: (entry: InboxQueueEntry) => ReactNode;
}) {
  const live = entries.filter((entry) => !entry.gone).length;
  return (
    <Stack gap="2xs" component="section">
      <Group gap="sm" {...stylex.props(styles.groupHeader)}>
        <ScopeTitle scope={scope} known={known} />
        {/* A section whose rows were all decided here shows their outcomes, not a 0. */}
        {live > 0 && (
          <Text size="sm" c="dimmed" {...stylex.props(styles.count)}>
            {live}
          </Text>
        )}
      </Group>
      {entries.map(renderEntry)}
    </Stack>
  );
}
