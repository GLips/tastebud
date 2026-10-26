/**
 * Places' location tools: "Where am I?" beside the resolver it runs, and "Test these working
 * locations", the probes the audit checks scopes against, kept in this browser.
 */
import { ActionIcon, Button, Code, Group, Paper, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LocateFixed, Plus, X } from "lucide-react";
import { useState } from "react";

import type { AuditPlacesResult } from "../../core/index.ts";
import type { PlaceResolverName } from "../../shared/vocabulary.ts";
import { PlaceChip } from "../place-chips.tsx";
import { reviewContextQuery } from "../review-queries.ts";
import { type KnownPlaces, useKnownPlaces, useReviewCatalog } from "../use-review-context.ts";

const styles = stylex.create({
  probeRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.9fr) 16px minmax(0, 1.1fr) auto",
    columnGap: "8px",
    alignItems: "center",
    paddingBlock: "4px",
  },
  mono: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: "12px", wordBreak: "break-all" },
});

const PLACE_RESOLVER_DESCRIPTIONS: Record<PlaceResolverName, string> = {
  git: "a repo place from the origin remote and the subdirectory, else the directory itself",
  directories: "always the working directory",
  custom: "a function in taste.config.ts",
};

/** "Where am I?": one directory through the configured resolver, without touching the probes. */
export function WhereAmIPanel({ onKeep }: { onKeep: (directory: string) => void }) {
  const catalog = useReviewCatalog();
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string | undefined>(undefined);
  const resolved = useQuery(reviewContextQuery({ in: asked }));
  const known = useKnownPlaces(resolved.data?.places ?? []);
  return (
    <Paper p="sm">
      <Stack gap={8}>
        <Stack gap={2}>
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
          <Group gap={6} wrap="nowrap">
            <TextInput
              size="xs"
              aria-label="Where am I? A working directory to resolve"
              placeholder="e.g. ~/code/acme-web/apps/checkout"
              leftSection={<LocateFixed size={13} />}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button size="xs" variant="default" type="submit" loading={resolved.isFetching}>
              Resolve
            </Button>
          </Group>
        </form>
        {asked !== undefined && resolved.error && (
          <Text size="xs" c="red.7" style={{ whiteSpace: "pre-wrap" }}>
            {resolved.error.message}
          </Text>
        )}
        {asked !== undefined && resolved.data !== undefined && (
          <Group gap={6}>
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
      <Stack gap={8}>
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
            <Text size="xs" c={unmatchedCount > 0 ? "orange.8" : "taste.8"}>
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
          <div>
            {probes.map((probe) => {
              const resolution = audit?.audit.probes.find(
                (entry) => entry.probe === probe || entry.places.includes(probe),
              );
              return (
                <div key={probe} {...stylex.props(styles.probeRow)}>
                  <Text {...stylex.props(styles.mono)}>{probe}</Text>
                  <ArrowRight size={12} color="var(--mantine-color-gray-5)" />
                  <Group gap={4}>
                    {resolution === undefined ? (
                      <Text size="xs" c="dimmed">
                        …
                      </Text>
                    ) : resolution.places.length === 0 ? (
                      <Text size="xs" c="orange.8">
                        No places (unknown context)
                      </Text>
                    ) : (
                      resolution.places.map((place) => (
                        <PlaceChip key={place} place={place} label={known.labelOf(place)} />
                      ))
                    )}
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
                </div>
              );
            })}
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addProbe(draft);
            setDraft("");
          }}
        >
          <Group gap={6} wrap="nowrap">
            <TextInput
              size="xs"
              aria-label="Add a working location"
              placeholder="clients/acme, or ~/code/acme-web"
              leftSection={<Plus size={13} />}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              style={{ flex: 1 }}
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
