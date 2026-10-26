import {
  ActionIcon,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { Folder, GitCommitVertical, Search, Tag } from "lucide-react";
import { useState } from "react";

import { capitalize } from "../ui/kind-identity.tsx";
import { KnownPlaceSearch } from "../ui/known-place-search.tsx";
import { RecallCandidateGroups } from "../ui/recall/recall-candidate-groups.tsx";
import { RecallContextSummary, RecallFailure } from "../ui/recall/recall-context.tsx";
import { RecallFindItemPanel } from "../ui/recall/recall-find-item-panel.tsx";
import { RecallInjectedPanel } from "../ui/recall/recall-injected-panel.tsx";
import { recallInspectionQuery } from "../ui/review-queries.ts";
import { useKnownPlaces, useReviewCatalog } from "../ui/use-review-context.ts";

/** `in` is a directory to resolve and `at` a place taken as given, the same terms core uses. */
const RecallSearch = Schema.Struct({
  q: Schema.optionalKey(Schema.String),
  in: Schema.optionalKey(Schema.String),
  at: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Schema.String),
  history: Schema.optionalKey(Schema.Boolean),
});

export const Route = createFileRoute("/recall")({
  validateSearch: Schema.toStandardSchemaV1(RecallSearch),
  component: RecallInspectorScreen,
});

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr) minmax(0, 0.9fr)", "@media (max-width: 960px)": "minmax(0, 1fr)" },
    gap: "20px",
    alignItems: "start",
  },
  stale: { opacity: 0.55 },
});

type ContextMode = "in" | "at" | "none";

function RecallInspectorScreen() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const initialMode: ContextMode = search.at !== undefined && search.in === undefined ? "at" : "in";
  const [query, setQuery] = useState(search.q ?? "");
  const [mode, setMode] = useState<ContextMode>(initialMode);
  const [directory, setDirectory] = useState(search.in ?? "");
  const [place, setPlace] = useState(search.at ?? "");
  const submitted = {
    query: search.q ?? "",
    kind: search.kind,
    history: search.history ?? false,
    in: search.in,
    at: search.at === undefined ? undefined : [search.at],
  };
  const inspection = useQuery(recallInspectionQuery(submitted));
  const recallKinds = (catalog?.derivedKinds ?? []).filter((kind) => kind.recall !== "never");

  const draftSearch = {
    ...(query.trim() !== "" && { q: query.trim() }),
    ...(mode === "in" && directory.trim() !== "" && { in: directory.trim() }),
    ...(mode === "at" && place.trim() !== "" && { at: place.trim() }),
    ...(search.kind !== undefined && { kind: search.kind }),
    ...(search.history === true && { history: true }),
  };
  const stale =
    (draftSearch.q ?? "") !== (search.q ?? "") ||
    (draftSearch.in ?? "") !== (search.in ?? "") ||
    (draftSearch.at ?? "") !== (search.at ?? "");
  const run = (overrides: { kind?: string | undefined; history?: boolean } = {}) => {
    const merged = { ...draftSearch, ...overrides };
    void navigate({
      search: {
        ...(merged.q !== undefined && { q: merged.q }),
        ...(merged.in !== undefined && { in: merged.in }),
        ...(merged.at !== undefined && { at: merged.at }),
        ...(merged.kind !== undefined && { kind: merged.kind }),
        ...(merged.history === true && { history: true }),
      },
      replace: true,
    });
  };

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Title order={3}>Recall</Title>
        <Text size="xs" c="dimmed">
          What an agent would be told for a prompt, standing in a directory or at a place, and why each item made it or
          didn't.
        </Text>
      </Stack>
      <Paper p="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
        >
          <Stack gap={8}>
            <Group gap="sm" wrap="nowrap">
              <TextInput
                aria-label="Prompt"
                placeholder="A prompt, e.g. add error handling to the checkout fetch"
                leftSection={<Search size={14} />}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                style={{ flex: 1 }}
                autoFocus
              />
              <Button type="submit" size="sm" disabled={query.trim() === ""}>
                Recall
              </Button>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <SegmentedControl
                size="xs"
                value={mode}
                onChange={(value) => setMode(value === "at" ? "at" : value === "none" ? "none" : "in")}
                data={[
                  { value: "in", label: "Directory" },
                  { value: "at", label: "Place" },
                  { value: "none", label: "Nowhere" },
                ]}
              />
              {mode === "in" && (
                <TextInput
                  size="xs"
                  aria-label="Pretend I'm in this directory"
                  placeholder="Pretend I'm in… e.g. ~/code/acme-web/apps/checkout"
                  leftSection={<Folder size={13} />}
                  value={directory}
                  onChange={(event) => setDirectory(event.currentTarget.value)}
                  style={{ flex: 1 }}
                />
              )}
              {mode === "at" && (
                <KnownPlaceSearch
                  known={known}
                  options={known.places}
                  aria-label="Stand at this place"
                  placeholder="Search places, or type any key, e.g. clients/acme"
                  leftSection={<Tag size={13} />}
                  value={place}
                  onChange={setPlace}
                  onPick={setPlace}
                  style={{ flex: 1 }}
                />
              )}
              {mode === "none" && (
                <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                  Unknown context: only global items can apply, and the hook stays silent.
                </Text>
              )}
              <Select
                size="xs"
                w={170}
                aria-label="Kinds to recall"
                value={search.kind ?? "all"}
                allowDeselect={false}
                data={[
                  { value: "all", label: "Every recallable kind" },
                  ...recallKinds.map((kind) => ({ value: kind.key, label: capitalize(kind.plural) })),
                ]}
                onChange={(value) => run({ kind: value === null || value === "all" ? undefined : value })}
              />
              <Tooltip
                label={submitted.history ? "Including replaced and retracted" : "Include replaced and retracted"}
                withArrow
              >
                <ActionIcon
                  size="md"
                  variant={submitted.history ? "light" : "default"}
                  aria-label="Include history"
                  aria-pressed={submitted.history}
                  onClick={() => run({ history: !submitted.history })}
                >
                  <GitCommitVertical size={15} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {inspection.data !== undefined && <RecallContextSummary context={inspection.data.recall.context} />}
          </Stack>
        </form>
      </Paper>

      {submitted.query === "" ? (
        <Center py={60}>
          <Text c="dimmed">Type a prompt to see what Taste would offer for it.</Text>
        </Center>
      ) : inspection.error ? (
        <RecallFailure error={inspection.error} />
      ) : inspection.data === undefined ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <div {...stylex.props(styles.layout)}>
          <Stack gap="lg" {...stylex.props(stale && styles.stale)}>
            <RecallCandidateGroups recall={inspection.data.recall} hook={inspection.data.hook} catalog={catalog} />
            <RecallFindItemPanel
              request={{ kind: submitted.kind, history: submitted.history, in: submitted.in, at: submitted.at }}
              recall={inspection.data.recall}
              hook={inspection.data.hook}
            />
          </Stack>
          <RecallInjectedPanel hook={inspection.data.hook} stale={stale || inspection.isFetching} />
        </div>
      )}
    </Stack>
  );
}
