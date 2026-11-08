import { Box, Button, Checkbox, Group, Paper, SegmentedControl, Select, Stack, Text, TextInput } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Schema } from "effect";
import { Folder, Search, Tag } from "lucide-react";
import { useState } from "react";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { KnownPlaceSearch } from "#review/shared/ui/known-place-search.tsx";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";

import { RecallAppliesPanel } from "./recall-applies-panel.tsx";
import { RecallCandidateGroups } from "./recall-candidate-groups.tsx";
import { RecallContextSummary, RecallFailure } from "./recall-context.tsx";
import { RecallFindItemPanel } from "./recall-find-item-panel.tsx";
import { recallInspectionQuery } from "./recall-queries.ts";
import { useRecallAppliesHere } from "./use-recall-applies-here.ts";

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
  grow: { flex: 1, minWidth: 0 },
  stale: { opacity: 0.55 },
});

const CONTEXT_MODES = ["in", "at", "none"] as const;
type ContextMode = (typeof CONTEXT_MODES)[number];

/** The segmented control hands back a string; anything unrecognised means a directory. */
const contextModeOf = (value: string): ContextMode => CONTEXT_MODES.find((mode) => mode === value) ?? "in";

function initialModeOf(search: { readonly in?: string; readonly at?: string }): ContextMode {
  if (search.at !== undefined && search.in === undefined) return "at";
  if (search.in !== undefined) return "in";
  return "none";
}

export function RecallInspectorPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const [query, setQuery] = useState(search.q ?? "");
  const [mode, setMode] = useState<ContextMode>(initialModeOf(search));
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
  const { nowhere, standing, applies } = useRecallAppliesHere(submitted);
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
      <ReviewPageHeader
        title="Recall"
        purpose="What an agent is told in a place: everything that applies there, and for a prompt, what gets sent with it and why."
      />
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
                placeholder="A prompt (optional), e.g. add error handling to the checkout fetch"
                leftSection={<Search size={14} />}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                {...stylex.props(styles.grow)}
                autoFocus
              />
              <Button type="submit" size="sm">
                Check
              </Button>
            </Group>
            <Group gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed">
                Where
              </Text>
              <SegmentedControl
                size="xs"
                value={mode}
                onChange={(value) => setMode(contextModeOf(value))}
                data={[
                  { value: "at", label: "At a place" },
                  { value: "in", label: "In a folder" },
                  { value: "none", label: "Nowhere in particular" },
                ]}
              />
              {mode === "in" && (
                <TextInput
                  size="xs"
                  aria-label="Pretend I'm in this folder"
                  placeholder="e.g. ~/code/acme-web/apps/checkout"
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
                  Only items that apply everywhere reach, and the prompt hook stays silent.
                </Text>
              )}
              <Text size="xs" c="dimmed">
                What
              </Text>
              <Select
                size="xs"
                w={150}
                aria-label="Kinds to recall"
                value={search.kind ?? "all"}
                allowDeselect={false}
                data={[
                  { value: "all", label: "All kinds" },
                  ...recallKinds.map((kind) => ({ value: kind.key, label: capitalize(kind.plural) })),
                ]}
                onChange={(value) => run({ kind: value === null || value === "all" ? undefined : value })}
              />
              <Checkbox
                size="xs"
                label="Include replaced and retracted"
                checked={submitted.history}
                onChange={() => run({ history: !submitted.history })}
              />
            </Group>
            {standing !== undefined && <RecallContextSummary context={standing} />}
          </Stack>
        </form>
      </Paper>

      <Box {...stylex.props(stale && styles.stale)}>
        {submitted.query === "" ? (
          <RecallAppliesPanel applies={applies} hookLimit={catalog?.hook.limit ?? 3} nowhere={nowhere} />
        ) : (
          <LoadedQueryContent query={inspection} failurePanel={RecallFailure}>
            {(inspected) => {
              const surfaced = new Set(
                [
                  ...inspected.hook.items,
                  ...inspected.recall.accepted,
                  ...inspected.recall.history,
                  ...inspected.recall.excluded,
                ].map((item) => item.id),
              );
              return (
                <Stack gap="lg">
                  <RecallCandidateGroups
                    recall={inspected.recall}
                    hook={inspected.hook}
                    catalog={catalog}
                    appliesUnmatched={applies.byKind
                      .flatMap((group) => group.accepted)
                      .filter((item) => !surfaced.has(item.id))}
                  />
                  <RecallFindItemPanel
                    request={{ kind: submitted.kind, history: submitted.history, in: submitted.in, at: submitted.at }}
                    recall={inspected.recall}
                    hook={inspected.hook}
                  />
                </Stack>
              );
            }}
          </LoadedQueryContent>
        )}
      </Box>
    </Stack>
  );
}
