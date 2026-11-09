/**
 * Places' "Test a path": which place one folder (or named place) resolves to, opened above the place it
 * lands on, and the paths you keep checking, which the audit warns about when none reach a place.
 * The kept paths live in this browser.
 */
import { ActionIcon, Badge, Box, Button, Group, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuditPlacesResult } from "@tastebud/core/places-audit";
import type { PlaceResolverName } from "@tastebud/core/taste-vocabulary";
import { ArrowRight, LocateFixed, Pin, X } from "lucide-react";
import { useState } from "react";

import { reviewContextQuery, useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { PlaceChip } from "#review/shared/ui/place-chips.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

const styles = stylex.create({
  panel: {
    paddingBottom: "16px",
    marginBottom: "16px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--mantine-color-gray-2)",
  },
  grow: { flex: 1 },
  preWrap: { whiteSpace: "pre-wrap" },
  pathRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.9fr) 16px minmax(0, 1.1fr) auto",
    columnGap: "8px",
    alignItems: "center",
    paddingBlock: "4px",
  },
  mono: { fontFamily: "var(--mantine-font-family-monospace)", wordBreak: "break-all" },
});

const PLACE_RESOLVER_DESCRIPTIONS: Record<PlaceResolverName, string> = {
  git: "Inside a git checkout, its repo (and subfolder); anywhere else, the folder itself",
  directories: "The folder itself",
  custom: "A rule in tastebud.config.ts decides",
};

/** The places a path resolved to, or a quiet "no place" when the resolver returned none. */
function ResolvedPlaces({ places, known }: { places: ReadonlyArray<string> | undefined; known: KnownPlaces }) {
  if (places === undefined) return <SupportingText tier="faint">…</SupportingText>;
  if (places.length === 0) return <Badge color="orange">No place</Badge>;
  return places.map((place) => <PlaceChip key={place} place={place} label={known.labelOf(place)} />);
}

/**
 * Of the places a path resolves to, the one the details pane opens: the most specific with items, else the
 * most specific, so a path that lands nowhere in use still shows that nothing applies there.
 */
const placeToOpenOf = (places: ReadonlyArray<string>, audit: AuditPlacesResult | undefined) => {
  const specificFirst = places.toSorted((left, right) => right.length - left.length);
  return specificFirst.find((place) => audit?.places.some((entry) => entry.place === place)) ?? specificFirst[0];
};

export function PlacePathTester({
  probes,
  addProbe,
  setProbes,
  audit,
  known,
  onOpenPlace,
  onClose,
}: {
  probes: ReadonlyArray<string>;
  addProbe: (probe: string) => void;
  setProbes: (probes: ReadonlyArray<string>) => void;
  audit: AuditPlacesResult | undefined;
  known: KnownPlaces;
  onOpenPlace: (place: string) => void;
  onClose: () => void;
}) {
  const catalog = useReviewCatalog();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string | undefined>(undefined);
  const resolved = useQuery({ ...reviewContextQuery({ in: asked }), enabled: asked !== undefined });
  const resolvedKnown = useKnownPlaces(resolved.data?.places ?? []);
  const unreached = probes.length === 0 ? 0 : (audit?.audit.unmatched.length ?? 0);

  const test = async (path: string) => {
    setAsked(path);
    const context = await queryClient.fetchQuery(reviewContextQuery({ in: path }));
    const place = placeToOpenOf(context.places, audit);
    if (place !== undefined) onOpenPlace(place);
  };

  return (
    <Stack gap="sm" {...stylex.props(styles.panel)}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs">
          <Text fw={600}>Test a path</Text>
          {catalog !== undefined && (
            <Tooltip label={PLACE_RESOLVER_DESCRIPTIONS[catalog.resolver]} withArrow multiline maw={300}>
              <Badge color="gray">Resolver: {catalog.resolver}</Badge>
            </Tooltip>
          )}
        </Group>
        <Tooltip label="Close" withArrow>
          <ActionIcon variant="subtle" color="gray" aria-label="Close Test a path" onClick={onClose}>
            <X size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() !== "") void test(draft.trim());
        }}
      >
        <Group gap="xs" wrap="nowrap">
          <TextInput
            aria-label="A folder or place to test"
            placeholder="~/code/acme-web/apps/checkout"
            leftSection={<LocateFixed size={14} />}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            data-autofocus
            {...stylex.props(styles.grow)}
          />
          <Button variant="default" type="submit" loading={resolved.isFetching}>
            Test
          </Button>
        </Group>
      </form>
      {asked !== undefined && resolved.error && (
        <Text size="sm" c="red.7" {...stylex.props(styles.preWrap)}>
          {resolved.error.message}
        </Text>
      )}
      {asked !== undefined && !resolved.error && (
        <Box {...stylex.props(styles.pathRow)}>
          <Text fz="xs" {...stylex.props(styles.mono)}>
            {asked}
          </Text>
          <ArrowRight size={12} color="var(--mantine-color-gray-5)" />
          <Group gap="2xs">
            <ResolvedPlaces places={resolved.data?.places} known={resolvedKnown} />
          </Group>
          {probes.includes(asked) ? (
            <Box />
          ) : (
            <Tooltip label="Keep checking it: places none of your kept paths reach get a warning" withArrow multiline>
              <Button variant="subtle" size="xs" leftSection={<Pin size={12} />} onClick={() => addProbe(asked)}>
                Keep
              </Button>
            </Tooltip>
          )}
        </Box>
      )}
      {probes.length > 0 && (
        <Stack gap="3xs">
          <Group gap="xs">
            <Text size="sm" fw={600}>
              Kept paths
            </Text>
            {audit !== undefined && (
              <Badge color={unreached > 0 ? "orange" : "tastebud"}>
                {unreached > 0 ? `${unreached} ${unreached === 1 ? "place" : "places"} unreached` : "All reached"}
              </Badge>
            )}
          </Group>
          {probes.map((probe) => (
            <Box key={probe} {...stylex.props(styles.pathRow)}>
              <Text fz="xs" {...stylex.props(styles.mono)}>
                {probe}
              </Text>
              <ArrowRight size={12} color="var(--mantine-color-gray-5)" />
              <Group gap="2xs">
                <ResolvedPlaces
                  places={
                    audit?.audit.probes.find((entry) => entry.probe === probe || entry.places.includes(probe))?.places
                  }
                  known={known}
                />
              </Group>
              <Tooltip label="Stop checking this" withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label={`Remove ${probe}`}
                  onClick={() => setProbes(probes.filter((kept) => kept !== probe))}
                >
                  <X size={13} />
                </ActionIcon>
              </Tooltip>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
