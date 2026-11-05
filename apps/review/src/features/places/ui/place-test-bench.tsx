/**
 * Places' location tools: "Where am I?" beside the resolver it runs, and "Test these working
 * locations", the probes the audit checks scopes against, kept in this browser.
 */
import { Box, ActionIcon, Button, Code, Group, Paper, Stack, Text, TextInput, Tooltip } from "@mantine/core";
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
  git: "a repo place from the origin remote and the subdirectory, else the directory itself",
  directories: "always the working directory",
  custom: "a function in tastebud.config.ts",
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
            Where am I?
          </Text>
          {catalog !== undefined && (
            <Text size="xs" c="dark.4">
              Resolver{" "}
              <Text span fw={600} size="xs">
                {catalog.resolver}
              </Text>
              : {PLACE_RESOLVER_DESCRIPTIONS[catalog.resolver]}.
            </Text>
          )}
          <Text size="xs" c="dark.4">
            Callers outside a filesystem say where they are with <Code>--at &lt;place&gt;</Code>, e.g.{" "}
            <Code>--at clients/acme</Code>.
          </Text>
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
              Add to probes
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
          <Tooltip
            label="Places you work in: any place key, or a working directory the resolver turns into one. The audit flags accepted scope places none of them reach. Kept in this browser."
            withArrow
            multiline
            w={300}
            position="top-start"
          >
            <Text size="sm" fw={600} w="fit-content">
              Test these working locations
            </Text>
          </Tooltip>
          {probes.length > 0 && audit !== undefined && (
            <Text size="xs" c={unmatchedCount > 0 ? "orange.8" : "tastebud.8"}>
              {unmatchedCount === 0
                ? `Every accepted scope place is matched by ${probes.length === 1 ? "this probe" : `these ${probes.length} probes`}`
                : `${unmatchedCount} ${unmatchedCount === 1 ? "place" : "places"} unmatched by ${probes.length === 1 ? "this probe" : `these ${probes.length} probes`}`}
            </Text>
          )}
        </Group>
        {probes.length === 0 ? (
          <Text size="xs" c="dimmed">
            No probes yet. Add the places you work in to see which scope places none of them reach.
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
                  <Tooltip label="Remove this probe" withArrow>
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
              Add probe
            </Button>
          </Group>
        </form>
      </Stack>
    </Paper>
  );
}
