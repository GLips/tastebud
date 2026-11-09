/** One scope's section of the inbox list: a header row naming the place and how many wait there, then the rows. */
import { Box, Button, Group, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import type { DerivationScope } from "@tastebud/core/places";
import { Globe } from "lucide-react";
import type { ReactNode } from "react";

import { recordDetailQuery } from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { CountBadge } from "#review/shared/ui/count-badge.tsx";
import { PlaceFormIcon } from "#review/shared/ui/place-chips.tsx";
import { ButtonLink } from "#review/shared/ui/router-links.tsx";

import { inboxListStyles } from "./inbox-list-styles.ts";
import type { InboxQueueEntry } from "./inbox-queue.ts";

const styles = stylex.create({
  shrinkable: { minWidth: 0 },
  sectionHeader: {
    position: "sticky",
    top: "var(--review-shell-header-height)",
    zIndex: 5,
    paddingBlock: "8px",
    paddingInline: "12px",
    backgroundColor: "var(--mantine-color-gray-0)",
  },
  gone: { paddingBlock: "8px", paddingInline: "12px", backgroundColor: "var(--mantine-color-gray-0)" },
});

/** The section's scope as its title: the place names themselves, not chips. */
function ScopeTitle({ scope, known }: { scope: DerivationScope; known: KnownPlaces }) {
  if (scope.scope === "global") {
    return (
      <Group gap="xxs" wrap="nowrap">
        <Globe size={14} aria-hidden />
        <Text size="sm" fw={600}>
          Everywhere
        </Text>
      </Group>
    );
  }
  return (
    <Group gap="xs" wrap="wrap">
      {scope.places.map((place, index) => (
        <Group key={place} gap="xxs" wrap="nowrap">
          {index > 0 && (
            <Text size="sm" c="dimmed" fw={600}>
              +
            </Text>
          )}
          <PlaceFormIcon place={place} size={14} />
          <Text size="sm" fw={600}>
            {known.labelOf(place)}
          </Text>
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
    <Box {...stylex.props(inboxListStyles.divided, styles.gone)}>
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
    </Box>
  );
}

export function InboxGroupSection({
  scope,
  entries,
  first,
  known,
  renderEntry,
}: {
  scope: DerivationScope;
  entries: ReadonlyArray<InboxQueueEntry>;
  /** The list's first section, whose header sits on the surface's own top border instead of a hairline. */
  first: boolean;
  known: KnownPlaces;
  renderEntry: (entry: InboxQueueEntry) => ReactNode;
}) {
  const live = entries.filter((entry) => !entry.gone).length;
  return (
    <Box component="section">
      <Group gap="xs" {...stylex.props(!first && inboxListStyles.divided, styles.sectionHeader)}>
        <ScopeTitle scope={scope} known={known} />
        {/* A section whose rows were all decided here shows their outcomes, not a 0. */}
        {live > 0 && <CountBadge count={live} />}
      </Group>
      {entries.map(renderEntry)}
    </Box>
  );
}
