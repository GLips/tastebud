import { Box, Button, Collapse, Group, Paper, Stack, Text, Title } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Schema } from "effect";
import { ChevronRight, LocateFixed } from "lucide-react";
import { useState } from "react";

import { useKnownPlaces } from "#review/features/review-shell/index.ts";
import { useRememberedBrowserValue } from "#review/infrastructure/browser-storage.ts";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";

import { PlaceDetails } from "./place-details.tsx";
import { PlaceTestBench, WhereAmIPanel } from "./place-test-bench.tsx";
import { PlaceTreeNav, selectedPlaceOf } from "./place-tree-nav.tsx";
import { placesAuditQuery } from "./places-queries.ts";

export const PlacesSearch = Schema.Struct({ place: Schema.optionalKey(Schema.String) });

const Route = getRouteApi("/places");

/** The probes live in the browser: the audit is only ever "unmatched by these", never "broken". */
const PROBES_STORAGE_KEY = "tastebud.places.probes";

const styles = stylex.create({
  location: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr) minmax(0, 1.2fr)", "@media (max-width: 860px)": "minmax(0, 1fr)" },
    gap: "20px",
    alignItems: "start",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "300px minmax(0, 1fr)", "@media (max-width: 860px)": "minmax(0, 1fr)" },
    gap: "20px",
    alignItems: "start",
  },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
});

function checkButtonLabel(checked: number, unreached: number): string {
  if (unreached > 0) return `Check a folder · ${unreached} unreached`;
  if (checked > 0) return `Check a folder · ${checked} checked`;
  return "Check a folder";
}

export function PlacesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [probes, setProbes] = useRememberedBrowserValue<ReadonlyArray<string>>(PROBES_STORAGE_KEY, []);
  const [checking, setChecking] = useState(false);
  const audit = useQuery(placesAuditQuery(probes));
  const known = useKnownPlaces();
  const data = audit.data;
  const selected = selectedPlaceOf(search.place, data, known);
  const select = (place: string) => void navigate({ search: { place }, replace: true });
  const addProbe = (probe: string) => {
    const trimmed = probe.trim();
    if (trimmed !== "" && !probes.includes(trimmed)) setProbes([...probes, trimmed]);
  };
  const unreached = probes.length === 0 ? 0 : (data?.audit.unmatched.length ?? 0);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <Stack gap="3xs">
          <Title order={3}>Places</Title>
          <Text size="sm" c="dimmed">
            The repos, folders and names your items are scoped to. Pick one to see everything that applies there and
            where each item comes from.
          </Text>
        </Stack>
        <Button
          variant={unreached > 0 ? "light" : "default"}
          color="orange"
          leftSection={<LocateFixed size={13} />}
          rightSection={<ChevronRight size={13} {...stylex.props(styles.chevron, checking && styles.chevronOpen)} />}
          onClick={() => setChecking(!checking)}
          aria-expanded={checking}
        >
          {checkButtonLabel(probes.length, unreached)}
        </Button>
      </Group>
      <Collapse expanded={checking}>
        <Box {...stylex.props(styles.location)}>
          <WhereAmIPanel onKeep={addProbe} />
          <PlaceTestBench probes={probes} addProbe={addProbe} setProbes={setProbes} audit={data} known={known} />
        </Box>
      </Collapse>
      <LoadedQueryContent query={audit}>
        {(auditResult) => (
          <Box {...stylex.props(styles.layout)}>
            <PlaceTreeNav
              audit={auditResult}
              probed={probes.length > 0}
              selected={selected}
              onSelect={select}
              known={known}
            />
            <Paper p="md">
              {selected === undefined ? (
                <Text c="dimmed">Pick a place.</Text>
              ) : (
                <PlaceDetails
                  key={selected}
                  place={selected}
                  audit={auditResult}
                  probes={probes}
                  known={known}
                  onSelect={select}
                />
              )}
            </Paper>
          </Box>
        )}
      </LoadedQueryContent>
    </Stack>
  );
}
