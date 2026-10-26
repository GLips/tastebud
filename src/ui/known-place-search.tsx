/**
 * The one way to pick a place by hand: search known places by label or key, each option showing its
 * form, label and full key. Callers own the typed text, so each decides what a typed, unknown entry
 * means: a new key, a subpath, or nothing yet.
 */
import { Autocomplete, type AutocompleteProps, Group, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";

import type { PlaceKey } from "../shared/places.ts";
import { PlaceFormIcon } from "./place-chips.tsx";
import type { KnownPlaces } from "./use-review-context.ts";

const styles = stylex.create({
  option: { display: "flex", flexDirection: "column", gap: "0px", minWidth: 0 },
  mono: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: "11px" },
});

export function KnownPlaceSearch({
  known,
  options,
  value,
  onChange,
  onPick,
  ...input
}: Omit<AutocompleteProps, "data" | "value" | "onChange" | "onOptionSubmit" | "filter" | "renderOption"> & {
  known: KnownPlaces;
  /** The places offered; a subset of `known.places`, e.g. without the ones already chosen. */
  options: ReadonlyArray<PlaceKey>;
  value: string;
  onChange: (text: string) => void;
  onPick: (place: PlaceKey) => void;
}) {
  return (
    <Autocomplete
      size="xs"
      limit={8}
      {...input}
      data={[...options]}
      value={value}
      onChange={onChange}
      onOptionSubmit={onPick}
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
    />
  );
}
