/** "Test these working locations": the probes the audit checks scopes against, kept in this browser. */
import { ActionIcon, Button, Group, Paper, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LocateFixed, Plus, X } from "lucide-react";
import { useState } from "react";

import type { AuditPlacesResult } from "../../core/index.ts";
import { PlaceChip } from "../place-chips.tsx";
import { reviewContextQuery } from "../review-queries.ts";
import { type KnownPlaces, useKnownPlaces } from "../use-review-context.ts";

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

/** "Where am I?": one directory through the configured resolver, without touching the probes. */
function WhereAmI({ onKeep }: { onKeep: (directory: string) => void }) {
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string | undefined>(undefined);
  const resolved = useQuery(reviewContextQuery({ in: asked }));
  const known = useKnownPlaces(resolved.data?.places ?? []);
  return (
    <Stack gap={6}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() !== "") setAsked(draft.trim());
        }}
      >
        <Group gap={6} wrap="nowrap">
          <TextInput
            size="xs"
            aria-label="Where am I? A directory to resolve"
            placeholder="Where am I? e.g. ~/code/acme-web/apps/checkout"
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
          <Text size="xs" c="dimmed">
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
  );
}

export function PlaceTestBench({
  probes,
  setProbes,
  audit,
  known,
}: {
  probes: ReadonlyArray<string>;
  setProbes: (probes: ReadonlyArray<string>) => void;
  audit: AuditPlacesResult | undefined;
  known: KnownPlaces;
}) {
  const [draft, setDraft] = useState("");
  const add = (probe: string) => {
    const trimmed = probe.trim();
    if (trimmed !== "" && !probes.includes(trimmed)) setProbes([...probes, trimmed]);
  };
  const unmatchedCount = audit?.audit.unmatched.length ?? 0;
  return (
    <Paper p="sm">
      <Stack gap={8}>
        <Group justify="space-between">
          <Tooltip
            label="Directories you work in, or place keys. The audit flags accepted scope places none of them reach. Kept in this browser."
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
            No probes yet. Add the directories you work in to see which scope places none of them reach.
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
            add(draft);
            setDraft("");
          }}
        >
          <Group gap={6} wrap="nowrap">
            <TextInput
              size="xs"
              aria-label="Add a working location"
              placeholder="A directory (~/code/acme-web) or a place key"
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
        <WhereAmI onKeep={add} />
      </Stack>
    </Paper>
  );
}
