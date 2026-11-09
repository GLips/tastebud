import { Box, Paper, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Schema } from "effect";
import { useState } from "react";

import { useKnownPlaces } from "#review/features/review-shell/index.ts";
import { useRememberedBrowserValue } from "#review/infrastructure/browser-storage.ts";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";

import { PLACE_REACH_TABS } from "./place-applicability.ts";
import { PlaceDetails } from "./place-details.tsx";
import { PlacePathTester } from "./place-test-bench.tsx";
import { PlaceTreeNav, selectedPlaceOf } from "./place-tree-nav.tsx";
import { placesAuditQuery } from "./places-queries.ts";

export const PlacesSearch = Schema.Struct({
  place: Schema.optionalKey(Schema.String),
  tab: Schema.optionalKey(Schema.Literals(PLACE_REACH_TABS)),
});

const Route = getRouteApi("/places");

/** The probes live in the browser: the audit is only ever "unmatched by these", never "broken". */
const PROBES_STORAGE_KEY = "tastebud.places.probes";

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "300px minmax(0, 1fr)", "@media (max-width: 860px)": "minmax(0, 1fr)" },
    gap: "20px",
    alignItems: "start",
  },
});

export function PlacesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [probes, setProbes] = useRememberedBrowserValue<ReadonlyArray<string>>(PROBES_STORAGE_KEY, []);
  const [testing, setTesting] = useState(false);
  const audit = useQuery(placesAuditQuery(probes));
  const known = useKnownPlaces();
  const data = audit.data;
  const selected = selectedPlaceOf(search.place, data, known);
  const select = (place: string) => void navigate({ search: { place }, replace: true });
  const addProbe = (probe: string) => {
    const trimmed = probe.trim();
    if (trimmed !== "" && !probes.includes(trimmed)) setProbes([...probes, trimmed]);
  };

  return (
    <Stack gap="md">
      <ReviewPageHeader title="Places" />
      <LoadedQueryContent query={audit}>
        {(auditResult) => (
          <Box {...stylex.props(styles.layout)}>
            <PlaceTreeNav
              audit={auditResult}
              probed={probes.length > 0}
              selected={selected}
              onSelect={select}
              known={known}
              testing={testing}
              onTestPath={() => setTesting(!testing)}
            />
            <Paper p="md">
              {testing && (
                <PlacePathTester
                  probes={probes}
                  addProbe={addProbe}
                  setProbes={setProbes}
                  audit={auditResult}
                  known={known}
                  onOpenPlace={select}
                  onClose={() => setTesting(false)}
                />
              )}
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
                  tab={search.tab}
                  onTabChange={(tab) => void navigate({ search: { ...search, tab }, replace: true })}
                />
              )}
            </Paper>
          </Box>
        )}
      </LoadedQueryContent>
    </Stack>
  );
}
