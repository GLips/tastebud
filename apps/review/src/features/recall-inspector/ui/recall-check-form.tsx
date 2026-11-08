/**
 * What Recall checks: a prompt (optional), where the agent stands, and which kinds. Once a check has
 * run it folds to one line saying what was checked, so the answer below leads; "Change" reopens it.
 * The rarer choices (standing in a folder or nowhere, including history) sit behind Options.
 */
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { Folder, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { PlaceSelect } from "#review/shared/ui/place-select.tsx";

const styles = stylex.create({
  grow: { flex: 1, minWidth: 0 },
});

export interface RecallCheck {
  readonly q?: string;
  readonly in?: string;
  readonly at?: string;
  readonly kind?: string;
  readonly history?: boolean;
}

const CONTEXT_MODES = ["at", "in", "none"] as const;
type ContextMode = (typeof CONTEXT_MODES)[number];

/** The segmented control hands back a string; anything unrecognised means a place. */
const contextModeOf = (value: string): ContextMode => CONTEXT_MODES.find((mode) => mode === value) ?? "at";

function initialModeOf(check: RecallCheck): ContextMode {
  if (check.in !== undefined) return "in";
  if (check.at !== undefined) return "at";
  return "none";
}

function whereWording(check: RecallCheck, labelOf: (place: string) => string): string {
  if (check.at !== undefined) return `at ${labelOf(check.at)}`;
  if (check.in !== undefined) return `in ${check.in}`;
  return "nowhere in particular";
}

/** The one-line account of a check that has run. */
function checkedSummary(check: RecallCheck, labelOf: (place: string) => string, kindLabel: string): string {
  const what = check.q === undefined ? "No prompt" : `“${check.q}”`;
  return `${what} · ${whereWording(check, labelOf)} · ${kindLabel}${check.history === true ? " · with replaced and retracted" : ""}`;
}

export function RecallCheckForm({ check, onRun }: { check: RecallCheck; onRun: (next: RecallCheck) => void }) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const hasRun = check.q !== undefined || check.at !== undefined || check.in !== undefined;
  const [editing, setEditing] = useState(!hasRun);
  const [optionsOpen, setOptionsOpen] = useState(check.in !== undefined || check.history === true);
  const [query, setQuery] = useState(check.q ?? "");
  const [mode, setMode] = useState<ContextMode>(initialModeOf(check));
  const [directory, setDirectory] = useState(check.in ?? "");
  const [place, setPlace] = useState(check.at);
  const [kind, setKind] = useState(check.kind);
  const [history, setHistory] = useState(check.history === true);
  const recallKinds = (catalog?.derivedKinds ?? []).filter((candidate) => candidate.recall !== "never");
  const kindLabel = capitalize(recallKinds.find((candidate) => candidate.key === check.kind)?.plural ?? "all kinds");

  if (!editing)
    return (
      <Paper px="sm" py="xs">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" truncate>
            {checkedSummary(check, known.labelOf, kindLabel)}
          </Text>
          <Button variant="default" onClick={() => setEditing(true)}>
            Change
          </Button>
        </Group>
      </Paper>
    );

  return (
    <Paper p="sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setEditing(false);
          onRun({
            ...(query.trim() !== "" && { q: query.trim() }),
            ...(mode === "in" && directory.trim() !== "" && { in: directory.trim() }),
            ...(mode === "at" && place !== undefined && { at: place }),
            ...(kind !== undefined && { kind }),
            ...(history && { history: true }),
          });
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
            {mode === "at" && (
              <Box {...stylex.props(styles.grow)}>
                <PlaceSelect value={place} known={known} onChange={setPlace} aria-label="Stand at this place" />
              </Box>
            )}
            {mode === "in" && (
              <TextInput
                size="xs"
                aria-label="The folder the agent works in"
                placeholder="The folder the agent works in, e.g. ~/code/acme-web/apps/checkout"
                leftSection={<Folder size={13} />}
                value={directory}
                onChange={(event) => setDirectory(event.currentTarget.value)}
                {...stylex.props(styles.grow)}
              />
            )}
            {mode === "none" && (
              <Text size="xs" c="dimmed" {...stylex.props(styles.grow)}>
                Nowhere in particular: only items that apply everywhere reach, and nothing is sent with prompts.
              </Text>
            )}
            <Select
              size="xs"
              w={140}
              aria-label="Kinds to check"
              value={kind ?? "all"}
              allowDeselect={false}
              data={[
                { value: "all", label: "All kinds" },
                ...recallKinds.map((candidate) => ({ value: candidate.key, label: capitalize(candidate.plural) })),
              ]}
              onChange={(value) => setKind(value === null || value === "all" ? undefined : value)}
            />
            <Button
              variant="subtle"
              color="gray"
              leftSection={<SlidersHorizontal size={13} />}
              onClick={() => setOptionsOpen(!optionsOpen)}
              aria-expanded={optionsOpen}
            >
              Options
            </Button>
          </Group>
          <Collapse expanded={optionsOpen}>
            <Group gap="md">
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
              <Checkbox
                size="xs"
                label="Include replaced and retracted"
                checked={history}
                onChange={() => setHistory(!history)}
              />
            </Group>
          </Collapse>
        </Stack>
      </form>
    </Paper>
  );
}
