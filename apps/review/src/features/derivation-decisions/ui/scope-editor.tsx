/**
 * The inline scope editor on an inbox card (`S`). It edits a draft only; nothing is decided until
 * the acceptance preview confirms it. Removing every place leaves the draft invalid on purpose.
 */
import { Box, ActionIcon, Button, Group, Kbd, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { canonicalPlaceKey, type DerivationScope, type PlaceKey, scopePlacesOf } from "@tastebud/core/places";
import { Result } from "effect";
import { ArrowRight, Globe, MapPin, Plus, RotateCcw, Scissors, X } from "lucide-react";
import { useState } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { KnownPlaceSearch } from "#review/shared/ui/known-place-search.tsx";
import { PlaceFormIcon, PlaceKeyCopy } from "#review/shared/ui/place-chips.tsx";

import {
  childPlaceKey,
  describeScopeChange,
  isCompleteScope,
  isSameScope,
  narrowerPlacesOf,
  narrowPlace,
  type ScopeDraft,
  withoutPlace,
  withPlace,
} from "./scope-draft.ts";

const styles = stylex.create({
  placeInput: { flex: 1, maxWidth: "460px" },
  panel: {
    borderRadius: "8px",
    backgroundColor: "var(--mantine-color-gray-0)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--mantine-color-gray-2)",
    padding: "10px 12px",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "16px minmax(0, auto) minmax(0, 1fr) auto",
    alignItems: "center",
    columnGap: "8px",
    minHeight: "28px",
  },
  narrow: { paddingLeft: "24px", paddingBottom: "4px" },
  summary: { display: "flex", flexDirection: "column", gap: "2px" },
});

/** Narrow to a known place inside this one, or type a subpath that no scope names yet. */
function NarrowPlacePicker({
  place,
  known,
  onNarrow,
  onClose,
}: {
  place: PlaceKey;
  known: KnownPlaces;
  onNarrow: (to: PlaceKey) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState("");
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const narrower = narrowerPlacesOf(place, known.places);
  const submit = () => {
    const key = childPlaceKey(place, path);
    if (Result.isFailure(key)) setProblem(key.failure);
    else onNarrow(key.success);
  };
  return (
    <Group gap="xxs" wrap="nowrap" {...stylex.props(styles.narrow)}>
      <KnownPlaceSearch
        known={known}
        options={narrower}
        autoFocus
        aria-label={`A place inside ${known.labelOf(place)}`}
        placeholder={
          narrower.length > 0 ? "Search places inside, or type a sub-place like apps/checkout" : "apps/checkout"
        }
        leftSection={<Text size="xs" c="dimmed">{`${known.labelOf(place)} /`}</Text>}
        leftSectionWidth={Math.min(220, 18 + known.labelOf(place).length * 6.5)}
        value={path}
        error={problem}
        onChange={(next) => {
          setPath(next);
          setProblem(undefined);
        }}
        onPick={onNarrow}
        onKeyDown={(event) => {
          if (event.key === "Enter" && path.trim() !== "" && !narrower.includes(path.trim())) {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        {...stylex.props(styles.placeInput)}
      />
      <Button size="xs" variant="default" onClick={submit} disabled={path.trim() === ""}>
        Narrow
      </Button>
      <Button size="xs" variant="subtle" color="gray" onClick={onClose}>
        Cancel
      </Button>
    </Group>
  );
}

function AddPlaceInput({
  draft,
  known,
  onAdd,
}: {
  draft: ScopeDraft;
  known: KnownPlaces;
  onAdd: (place: PlaceKey) => void;
}) {
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const chosen = new Set(scopePlacesOf(draft));
  const options = known.places.filter((place) => !chosen.has(place));
  const add = (raw: string) => {
    const key = canonicalPlaceKey(raw.trim());
    if (Result.isFailure(key)) {
      setProblem(key.failure);
      return;
    }
    onAdd(key.success);
    setValue("");
  };
  return (
    <KnownPlaceSearch
      known={known}
      options={options}
      // Mounts when a global draft is limited to places; an empty list means picking one comes next.
      autoFocus={draft.scope === "places" && draft.places.length === 0}
      aria-label="Add another place"
      placeholder="Add another place: search, or type any key, e.g. clients/acme or github.com/acme/web::"
      leftSection={<Plus size={13} />}
      value={value}
      error={problem}
      onChange={(next) => {
        setValue(next);
        setProblem(undefined);
      }}
      onPick={(place) => {
        onAdd(place);
        // Autocomplete writes the chosen option into the input after this; clear it on the next tick.
        setTimeout(() => setValue(""), 0);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && value.trim() !== "" && !options.includes(value.trim())) {
          event.preventDefault();
          add(value);
        }
      }}
    />
  );
}

export function ScopeEditor({
  proposed,
  draft,
  known,
  continueLabel,
  active,
  requireChange = false,
  onDraftChange,
  onContinue,
  onClose,
}: {
  /** The scope the draft is compared with: the proposed one, or the effective one for a revision. */
  proposed: DerivationScope;
  draft: ScopeDraft;
  known: KnownPlaces;
  /** The continue button's words for the scope it would continue with. */
  continueLabel: (scope: DerivationScope) => string;
  /** Only the editor on the selected card listens for Esc. */
  active: boolean;
  /** Moving an accepted one to the scope it already has would be a no-op, so its button waits for a change. */
  requireChange?: boolean;
  onDraftChange: (draft: ScopeDraft) => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  const [narrowing, setNarrowing] = useState<PlaceKey | undefined>(undefined);
  // A page-level Esc rather than a keydown on the panel: opening with S leaves focus outside it.
  useHotkeys([
    {
      hotkey: "Escape",
      callback: onClose,
      options: { ignoreInputs: false, enabled: active && narrowing === undefined },
    },
  ]);
  const stopNarrowing = () => setNarrowing(undefined);
  const changes = describeScopeChange(proposed, draft, known.labelOf);
  const edited = !isSameScope(proposed, draft);
  const complete = isCompleteScope(draft);
  return (
    <Box {...stylex.props(styles.panel)}>
      <Stack gap="xs">
        <Group justify="space-between" gap="xs">
          <Text size="sm" fw={600}>
            Where this applies
          </Text>
          {draft.scope === "places" && (
            <Tooltip label="Replace the list with every place, including future ones" withArrow>
              <Button
                size="compact-xs"
                variant="subtle"
                color="orange"
                leftSection={<Globe size={12} />}
                onClick={() => onDraftChange({ scope: "global" })}
              >
                Everywhere instead
              </Button>
            </Tooltip>
          )}
        </Group>

        {draft.scope === "global" ? (
          <Group gap="xs">
            <Globe size={14} color="var(--mantine-color-orange-6)" />
            <Text size="sm" fw={500} c="orange.8">
              Everywhere
            </Text>
            <Text size="xs" c="dimmed">
              Every place, including ones that don't exist yet
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<MapPin size={12} />}
              ml="auto"
              onClick={() => onDraftChange({ scope: "places", places: [] })}
            >
              Limit to places…
            </Button>
          </Group>
        ) : (
          <Stack gap="3xs">
            {draft.places.map((place) => (
              <Box key={place}>
                <Box {...stylex.props(styles.row)}>
                  <PlaceFormIcon place={place} size={13} />
                  <Text size="sm" fw={500}>
                    {known.labelOf(place)}
                  </Text>
                  <PlaceKeyCopy place={place} />
                  <Group gap="3xs" wrap="nowrap">
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      leftSection={<Scissors size={11} />}
                      onClick={() => setNarrowing(narrowing === place ? undefined : place)}
                    >
                      Narrow…
                    </Button>
                    <Tooltip label="Remove this place" withArrow>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        aria-label={`Remove ${known.labelOf(place)}`}
                        onClick={() => onDraftChange(withoutPlace(draft, place))}
                      >
                        <X size={13} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Box>
                {narrowing === place && (
                  <NarrowPlacePicker
                    place={place}
                    known={known}
                    onClose={stopNarrowing}
                    onNarrow={(to) => {
                      onDraftChange(narrowPlace(draft, place, to));
                      stopNarrowing();
                    }}
                  />
                )}
              </Box>
            ))}
            {draft.places.length === 0 && (
              <Text size="sm" c="red.7">
                Choose a place or apply everywhere.
              </Text>
            )}
          </Stack>
        )}

        {draft.scope === "places" && (
          <AddPlaceInput draft={draft} known={known} onAdd={(place) => onDraftChange(withPlace(draft, place))} />
        )}

        {changes.length > 0 && (
          <Box {...stylex.props(styles.summary)}>
            {changes.map((change) => (
              <Text key={change} size="xs" c={change.startsWith("Applies everywhere") ? "orange.8" : "dark.4"}>
                {change}
              </Text>
            ))}
          </Box>
        )}

        <Group justify="space-between" gap="xs">
          {edited ? (
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<RotateCcw size={12} />}
              onClick={() => onDraftChange(proposed)}
            >
              {requireChange ? "Restore current scope" : "Restore proposed scope"}
            </Button>
          ) : (
            <Box component="span" />
          )}
          <Group gap="xxs">
            <Tooltip label="Keep this draft and close the editor · Esc" withArrow>
              <Button size="xs" variant="default" onClick={onClose}>
                Done
              </Button>
            </Tooltip>
            <Button
              size="xs"
              disabled={!complete || (requireChange && !edited)}
              rightSection={<ArrowRight size={13} />}
              onClick={onContinue}
            >
              {complete ? continueLabel(draft) : "Choose a place"}
            </Button>
          </Group>
        </Group>
        <Text size="xs" c="dimmed">
          Nothing is saved until you confirm. <Kbd size="xs">Esc</Kbd> closes the editor and keeps the draft.
        </Text>
      </Stack>
    </Box>
  );
}
