/**
 * One place, picked the way the scope picker picks them: a button showing the place's icon and
 * label that opens a searchable list of repos with their folders, folders and named places, where
 * typed text can name a new folder, repo or name. For fields that take a single place, like where
 * Recall stands; it never offers Everywhere, but a host can list its own choices first.
 */
import { Button, Combobox, useCombobox } from "@mantine/core";
import { type PlaceKey, placeOfPlacePickerValue } from "@tastebud/core/places";
import { ChevronDown, MapPin } from "lucide-react";
import type { ReactNode } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";

import { PlaceFormIcon } from "./place-chips.tsx";
import { PlacePickerList } from "./place-picker-list.tsx";

/** A choice of the host's own, listed above the places: "Nowhere in particular". */
export interface PlaceSelectExtraOption {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  /** Checked in the list, and shown on the button while no place is chosen. */
  readonly selected: boolean;
  readonly onSelect: () => void;
}

const EXTRA_PREFIX = "extra:";
const NO_EXTRA_OPTIONS: ReadonlyArray<PlaceSelectExtraOption> = [];

export function PlaceSelect({
  value,
  known,
  onChange,
  extraOptions = NO_EXTRA_OPTIONS,
  placeholder = "Pick a place",
  "aria-label": ariaLabel,
}: {
  /** The chosen place, or none yet. */
  value: PlaceKey | undefined;
  known: KnownPlaces;
  onChange: (place: PlaceKey) => void;
  extraOptions?: ReadonlyArray<PlaceSelectExtraOption>;
  placeholder?: string;
  /** What the field is for, read before the chosen place: "Stand at this place". */
  "aria-label": string;
}) {
  const combobox = useCombobox();
  const submit = (picked: string) => {
    const extra = extraOptions.find((option) => `${EXTRA_PREFIX}${option.id}` === picked);
    const place = placeOfPlacePickerValue(picked);
    if (extra !== undefined) extra.onSelect();
    else if (place !== undefined) onChange(place);
    combobox.closeDropdown();
  };
  const selectedExtra = value === undefined ? extraOptions.find((option) => option.selected) : undefined;
  const label = value === undefined ? (selectedExtra?.label ?? placeholder) : known.labelOf(value);
  const icon =
    value === undefined ? (selectedExtra?.icon ?? <MapPin size={13} />) : <PlaceFormIcon place={value} size={13} />;
  return (
    <Combobox store={combobox} onOptionSubmit={submit} width={360} position="bottom-start" shadow="md">
      <Combobox.Target targetType="button">
        <Button
          variant="default"
          fw={400}
          leftSection={icon}
          rightSection={<ChevronDown size={13} />}
          aria-label={`${ariaLabel}: ${label}. Change`}
          {...(value !== undefined && { title: value })}
          onClick={() => combobox.toggleDropdown()}
        >
          {label}
        </Button>
      </Combobox.Target>
      <Combobox.Dropdown>
        {/* Mounted only while open, so the search starts empty each time. */}
        {combobox.dropdownOpened && (
          <PlacePickerList
            combobox={combobox}
            draft={{ scope: "places", places: value === undefined ? [] : [value] }}
            known={known}
            leadingRows={extraOptions.map((option) => ({
              value: `${EXTRA_PREFIX}${option.id}`,
              label: option.label,
              icon: option.icon,
              chosen: value === undefined && option.selected,
            }))}
          />
        )}
      </Combobox.Dropdown>
    </Combobox>
  );
}
