/**
 * Places' "Check a folder" tools: which place one folder resolves to, and the folders you work in
 * (the probes the audit checks scopes against), kept in this browser.
 */
import { Box, ActionIcon, Button, Group, Paper, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import type { AuditPlacesResult } from "@tastebud/core/places-audit";
import type { PlaceResolverName } from "@tastebud/core/taste-vocabulary";
import { ArrowRight, LocateFixed, Plus, X } from "lucide-react";
import { useState } from "react";

import { reviewContextQuery, useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { PlaceChip } from "#review/shared/ui/place-chips.tsx";

const styles = stylex.create({
  grow: { flex: 1 },
  preWrap: { whiteSpace: "pre-wrap" },
  probeRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.9fr) 16px minmax(0, 1.1fr) auto",
    columnGap: "8px",
    alignItems: "center",
    paddingBlock: "4px",
  },
  mono: { fontFamily: "var(--mantine-font-family-monospace)", wordBreak: "break-all" },
});

const PLACE_RESOLVER_DESCRIPTIONS: Record<PlaceResolverName, string> = {
  git: "inside a git checkout that's its repo (and subfolder), anywhere else the folder itself",
  directories: "the folder itself",
  custom: "a rule in tastebud.config.ts decides",
};

/** "Where am I?": one directory through the configured resolver, without touching the probes. */
/** What one probe resolved to: its places, or why there are none to show. */
function ProbeResolutionChips({
  resolution,
  known,
}: {
  resolution: AuditPlacesResult["audit"]["probes"][number] | undefined;
  known: KnownPlaces;
}) {
  if (resolution === undefined)
    return (
      <Text size="xs" c="dimmed">
        …
      </Text>
    );
  if (resolution.places.length === 0)
    return (
      <Text size="xs" c="orange.8">
        No places (unknown context)
      </Text>
    );
  return resolution.places.map((place) => <PlaceChip key={place} place={place} label={known.labelOf(place)} />);
}

export function WhereAmIPanel({ onKeep }: { onKeep: (directory: string) => void }) {
  const catalog = useReviewCatalog();
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string | undefined>(undefined);
  const resolved = useQuery(reviewContextQuery({ in: asked }));
  const known = useKnownPlaces(resolved.data?.places ?? []);
  return (
    <Paper p="sm">
      <Stack gap="xs">
        <Stack gap="3xs">
          <Text size="sm" fw={600}>
            Which place is this folder?
          </Text>
          {catalog !== undefined && (
            <Text size="xs" c="dark.4">
              An agent working in a folder is placed by the folder: {PLACE_RESOLVER_DESCRIPTIONS[catalog.resolver]}. An
              agent with no folder, like a chat app, names its place instead, such as clients/acme.
            </Text>
          )}
        </Stack>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim() !== "") setAsked(draft.trim());
          }}
        >
          <Group gap="xxs" wrap="nowrap">
            <TextInput
              size="xs"
              aria-label="Where am I? A working directory to resolve"
              placeholder="e.g. ~/code/acme-web/apps/checkout"
              leftSection={<LocateFixed size={13} />}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              {...stylex.props(styles.grow)}
            />
            <Button size="xs" variant="default" type="submit" loading={resolved.isFetching}>
              Resolve
            </Button>
          </Group>
        </form>
        {asked !== undefined && resolved.error && (
          <Text size="xs" c="red.7" {...stylex.props(styles.preWrap)}>
            {resolved.error.message}
          </Text>
        )}
        {asked !== undefined && resolved.data !== undefined && (
          <Group gap="xxs">
            <Text size="xs" c="dark.4">
              {resolved.data.places.length === 0 ? "Unknown context: the resolver returned no places" : "Resolves to"}
            </Text>
            {resolved.data.places.map((place) => (
              <PlaceChip key={place} place={place} label={known.labelOf(place)} />
            ))}
            <Button size="compact-xs" variant="subtle" onClick={() => onKeep(asked)}>
              Keep checking it
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}

export function PlaceTestBench({
  probes,
  addProbe,
  setProbes,
  audit,
  known,
}: {
  probes: ReadonlyArray<string>;
  addProbe: (probe: string) => void;
  setProbes: (probes: ReadonlyArray<string>) => void;
  audit: AuditPlacesResult | undefined;
  known: KnownPlaces;
}) {
  const [draft, setDraft] = useState("");
  const unmatchedCount = audit?.audit.unmatched.length ?? 0;
  return (
    <Paper p="sm">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            Folders you work in
          </Text>
          {probes.length > 0 && audit !== undefined && (
            <Text size="xs" c={unmatchedCount > 0 ? "orange.8" : "tastebud.8"}>
              {unmatchedCount === 0
                ? "Every place you've accepted items for is reached"
                : `${unmatchedCount} ${unmatchedCount === 1 ? "place" : "places"} with accepted items none of these reach`}
            </Text>
          )}
        </Group>
        {probes.length === 0 ? (
          <Text size="xs" c="dimmed">
            Add the folders (or place keys) you work in. Places with accepted items that none of them reach get a
            warning in the list, kept in this browser.
          </Text>
        ) : (
          <Box>
            {probes.map((probe) => {
              const resolution = audit?.audit.probes.find(
                (entry) => entry.probe === probe || entry.places.includes(probe),
              );
              return (
                <Box key={probe} {...stylex.props(styles.probeRow)}>
                  <Text fz="xs" {...stylex.props(styles.mono)}>
                    {probe}
                  </Text>
                  <ArrowRight size={12} color="var(--mantine-color-gray-5)" />
                  <Group gap="2xs">
                    <ProbeResolutionChips resolution={resolution} known={known} />
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
              );
            })}
          </Box>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addProbe(draft);
            setDraft("");
          }}
        >
          <Group gap="xxs" wrap="nowrap">
            <TextInput
              size="xs"
              aria-label="Add a working location"
              placeholder="clients/acme, or ~/code/acme-web"
              leftSection={<Plus size={13} />}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              {...stylex.props(styles.grow)}
            />
            <Button size="xs" variant="default" type="submit" disabled={draft.trim() === ""}>
              Add
            </Button>
          </Group>
        </form>
      </Stack>
    </Paper>
  );
}
