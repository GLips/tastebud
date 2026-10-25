/**
 * The inline scope editor on an inbox card (`S`). It edits a draft only; nothing is decided until
 * the acceptance preview confirms it. Removing every place leaves the draft invalid on purpose.
 */
import { ActionIcon, Autocomplete, Button, Group, Kbd, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { Result } from "effect";
import { ArrowRight, CornerDownRight, Globe, Plus, RotateCcw, Scissors, X } from "lucide-react";
import { useState } from "react";

import { canonicalPlaceKey, type DerivationScope, type PlaceKey } from "../shared/places.ts";
import { PlaceFormIcon, PlaceKeyCopy } from "./place-chips.tsx";
import {
  childPlaceKey,
  describeScopeChange,
  isCompleteScope,
  isSameScope,
  narrowerPlacesOf,
  narrowPlace,
  relativePlacePath,
  type ScopeDraft,
  withoutPlace,
  withPlace,
} from "./scope-draft.ts";
import type { KnownPlaces } from "./use-review-context.ts";

const styles = stylex.create({
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
  option: { display: "flex", flexDirection: "column", gap: "0px", minWidth: 0 },
  mono: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: "11px" },
});

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
    <Stack gap={6} {...stylex.props(styles.narrow)}>
      {narrower.length > 0 && (
        <Group gap={4}>
          <Text size="xs" c="dimmed" mr={2}>
            Known inside:
          </Text>
          {narrower.map((candidate) => (
            <Button
              key={candidate}
              size="compact-xs"
              variant="light"
              color="gray"
              leftSection={<CornerDownRight size={11} />}
              onClick={() => onNarrow(candidate)}
            >
              {relativePlacePath(place, candidate)}
            </Button>
          ))}
        </Group>
      )}
      <Group gap={6} wrap="nowrap">
        <TextInput
          size="xs"
          autoFocus
          aria-label={`A path inside ${known.labelOf(place)}`}
          placeholder="apps/checkout"
          leftSection={<Text size="xs" c="dimmed">{`${known.labelOf(place)} /`}</Text>}
          leftSectionWidth={Math.min(220, 18 + known.labelOf(place).length * 6.5)}
          value={path}
          error={problem}
          onChange={(event) => {
            setPath(event.currentTarget.value);
            setProblem(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape") {
              event.stopPropagation();
              onClose();
            }
          }}
          style={{ flex: 1, maxWidth: 420 }}
        />
        <Button size="xs" variant="default" onClick={submit} disabled={path.trim() === ""}>
          Narrow
        </Button>
        <Button size="xs" variant="subtle" color="gray" onClick={onClose}>
          Cancel
        </Button>
      </Group>
    </Stack>
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
  const chosen = new Set(draft.scope === "places" ? draft.places : []);
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
    <Autocomplete
      size="xs"
      aria-label="Add another place"
      placeholder="Add another place: search, or type a key like github.com/acme/web::apps/checkout"
      leftSection={<Plus size={13} />}
      data={options}
      value={value}
      error={problem}
      limit={8}
      onChange={(next) => {
        setValue(next);
        setProblem(undefined);
      }}
      onOptionSubmit={(place) => {
        onAdd(place);
        // Autocomplete writes the chosen option into the input after this; clear it on the next tick.
        setTimeout(() => setValue(""), 0);
      }}
      filter={({ options: all, search }) => {
        const needle = search.trim().toLowerCase();
        return all.filter(
          (option) =>
            "value" in option &&
            (needle === "" ||
              option.value.toLowerCase().includes(needle) ||
              known.labelOf(option.value).toLowerCase().includes(needle)),
        );
      }}
      renderOption={({ option }) => (
        <Group gap={8} wrap="nowrap">
          <PlaceFormIcon place={option.value} />
          <div {...stylex.props(styles.option)}>
            <Text size="xs" fw={500}>
              {known.labelOf(option.value)}
            </Text>
            <Text c="dimmed" {...stylex.props(styles.mono)}>
              {option.value}
            </Text>
          </div>
        </Group>
      )}
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
  requireChange = false,
  onDraftChange,
  onContinue,
  onClose,
}: {
  /** The scope the draft is compared with: the proposed one, or the effective one for a revision. */
  proposed: DerivationScope;
  draft: ScopeDraft;
  known: KnownPlaces;
  continueLabel: (edited: boolean) => string;
  /** A revision of an unchanged scope would be a no-op, so its button waits for a change. */
  requireChange?: boolean;
  onDraftChange: (draft: ScopeDraft) => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  const [narrowing, setNarrowing] = useState<PlaceKey | undefined>(undefined);
  const changes = describeScopeChange(proposed, draft, known.labelOf);
  const edited = !isSameScope(proposed, draft);
  const complete = isCompleteScope(draft);
  return (
    <div
      {...stylex.props(styles.panel)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && narrowing === undefined) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <Stack gap={8}>
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
                Apply everywhere
              </Button>
            </Tooltip>
          )}
        </Group>

        {draft.scope === "global" ? (
          <Group gap={8}>
            <Globe size={14} color="var(--mantine-color-orange-6)" />
            <Text size="sm" fw={500} c="orange.8">
              Everywhere
            </Text>
            <Text size="xs" c="dimmed">
              Every place, including ones that don't exist yet
            </Text>
          </Group>
        ) : (
          <Stack gap={2}>
            {draft.places.map((place) => (
              <div key={place}>
                <div {...stylex.props(styles.row)}>
                  <PlaceFormIcon place={place} size={13} />
                  <Text size="sm" fw={500}>
                    {known.labelOf(place)}
                  </Text>
                  <PlaceKeyCopy place={place} />
                  <Group gap={2} wrap="nowrap">
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
                </div>
                {narrowing === place && (
                  <NarrowPlacePicker
                    place={place}
                    known={known}
                    onClose={() => setNarrowing(undefined)}
                    onNarrow={(to) => {
                      onDraftChange(narrowPlace(draft, place, to));
                      setNarrowing(undefined);
                    }}
                  />
                )}
              </div>
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
          <div {...stylex.props(styles.summary)}>
            {changes.map((change) => (
              <Text key={change} size="xs" c={change.startsWith("Applies everywhere") ? "orange.8" : "dark.4"}>
                {change}
              </Text>
            ))}
          </div>
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
            <span />
          )}
          <Group gap={6}>
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
              {continueLabel(edited)}
            </Button>
          </Group>
        </Group>
        <Text size="xs" c="dimmed">
          Nothing is saved until you confirm. <Kbd size="xs">Esc</Kbd> closes the editor and keeps the draft.
        </Text>
      </Stack>
    </div>
  );
}
