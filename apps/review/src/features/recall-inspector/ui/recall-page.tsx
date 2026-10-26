import {
  Box,
  ActionIcon,
  Button,
  Center,
  Group,
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
import { getRouteApi } from "@tanstack/react-router";
import { Schema } from "effect";
import { Folder, GitCommitVertical, Search, Tag } from "lucide-react";
import { useState } from "react";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { KnownPlaceSearch } from "#review/shared/ui/known-place-search.tsx";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";

import { RecallCandidateGroups } from "./recall-candidate-groups.tsx";
import { RecallContextSummary, RecallFailure } from "./recall-context.tsx";
import { RecallFindItemPanel } from "./recall-find-item-panel.tsx";
import { RecallInjectedPanel } from "./recall-injected-panel.tsx";
import { recallInspectionQuery } from "./recall-queries.ts";

/** `in` is a directory to resolve and `at` a place taken as given, the same terms core uses. */
export const RecallSearch = Schema.Struct({
  q: Schema.optionalKey(Schema.String),
  in: Schema.optionalKey(Schema.String),
  at: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Schema.String),
  history: Schema.optionalKey(Schema.Boolean),
});

const Route = getRouteApi("/recall");

const styles = stylex.create({
  grow: { flex: 1 },
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr) minmax(0, 0.9fr)", "@media (max-width: 960px)": "minmax(0, 1fr)" },
    gap: "20px",
    alignItems: "start",
  },
  stale: { opacity: 0.55 },
});

const CONTEXT_MODES = ["in", "at", "none"] as const;
type ContextMode = (typeof CONTEXT_MODES)[number];

/** The segmented control hands back a string; anything unrecognised means a directory. */
const contextModeOf = (value: string): ContextMode => CONTEXT_MODES.find((mode) => mode === value) ?? "in";

export function RecallInspectorPage() {
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
      <Stack gap="3xs">
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
          <Stack gap="xs">
            <Group gap="sm" wrap="nowrap">
              <TextInput
                aria-label="Prompt"
                placeholder="A prompt, e.g. add error handling to the checkout fetch"
                leftSection={<Search size={14} />}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                {...stylex.props(styles.grow)}
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
                onChange={(value) => setMode(contextModeOf(value))}
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
                  {...stylex.props(styles.grow)}
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
                  {...stylex.props(styles.grow)}
                />
              )}
              {mode === "none" && (
                <Text size="xs" c="dimmed" {...stylex.props(styles.grow)}>
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
      ) : (
        <LoadedQueryContent query={inspection} failurePanel={RecallFailure}>
          {(inspected) => (
            <Box {...stylex.props(styles.layout)}>
              <Stack gap="lg" {...stylex.props(stale && styles.stale)}>
                <RecallCandidateGroups recall={inspected.recall} hook={inspected.hook} catalog={catalog} />
                <RecallFindItemPanel
                  request={{ kind: submitted.kind, history: submitted.history, in: submitted.in, at: submitted.at }}
                  recall={inspected.recall}
                  hook={inspected.hook}
                />
              </Stack>
              <RecallInjectedPanel hook={inspected.hook} stale={stale || inspection.isFetching} />
            </Box>
          )}
        </LoadedQueryContent>
      )}
    </Stack>
  );
}
