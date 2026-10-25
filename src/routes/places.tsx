import { Center, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { PlaceDetails } from "../ui/places/place-details.tsx";
import { PlaceTestBench } from "../ui/places/place-test-bench.tsx";
import { PlaceTreeNav, selectedPlaceOf } from "../ui/places/place-tree-nav.tsx";
import { placesAuditQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { useKnownPlaces } from "../ui/use-review-context.ts";

const PlacesSearch = Schema.Struct({ place: Schema.optionalKey(Schema.String) });

export const Route = createFileRoute("/places")({
  validateSearch: Schema.toStandardSchemaV1(PlacesSearch),
  component: PlacesScreen,
});

/** The probes live in the browser: the audit is only ever "unmatched by these", never "broken". */
const PROBES_STORAGE_KEY = "taste.places.probes";

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "300px minmax(0, 1fr)", "@media (max-width: 860px)": "minmax(0, 1fr)" },
    gap: "20px",
    alignItems: "start",
  },
});

function PlacesScreen() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [probes, setProbes] = useLocalStorage<ReadonlyArray<string>>({ key: PROBES_STORAGE_KEY, defaultValue: [] });
  const audit = useQuery(placesAuditQuery(probes));
  const known = useKnownPlaces();
  const data = audit.data;
  const selected = selectedPlaceOf(search.place, data, known);
  const select = (place: string) => void navigate({ search: { place }, replace: true });

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Title order={3}>Places</Title>
        <Text size="xs" c="dimmed">
          Every place a scope names, how much lives there, and whether the places you work in still reach it.
        </Text>
      </Stack>
      <PlaceTestBench probes={probes} setProbes={setProbes} audit={data} known={known} />
      {audit.error ? (
        <QueryErrorAlert error={audit.error} />
      ) : data === undefined ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <div {...stylex.props(styles.layout)}>
          <PlaceTreeNav audit={data} probed={probes.length > 0} selected={selected} onSelect={select} known={known} />
          <Paper p="md">
            {selected === undefined ? (
              <Text c="dimmed">Pick a place.</Text>
            ) : (
              <PlaceDetails key={selected} place={selected} audit={data} probes={probes} known={known} />
            )}
          </Paper>
        </div>
      )}
    </Stack>
  );
}
