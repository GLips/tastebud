/**
 * One place, picked the way the scope picker picks them: a button showing the place's icon and
 * label that opens a searchable list of repos with their folders, folders and named places, where
 * typed text can name a new folder, repo or name. For fields that take a single place, like where
 * Recall stands; it never offers Everywhere.
 */
import { Button, Combobox, useCombobox } from "@mantine/core";
import type { PlaceKey } from "@tastebud/core/places";
import { ChevronDown, MapPin } from "lucide-react";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { placeOfOptionValue } from "#review/shared/place-picker-options.ts";

import { PlaceFormIcon } from "./place-chips.tsx";
import { PlacePickerList } from "./place-picker-list.tsx";

export function PlaceSelect({
  value,
  known,
  onChange,
  placeholder = "Pick a place",
  "aria-label": ariaLabel,
}: {
  /** The chosen place, or none yet. */
  value: PlaceKey | undefined;
  known: KnownPlaces;
  onChange: (place: PlaceKey) => void;
  placeholder?: string;
  /** What the field is for, read before the chosen place: "Stand at this place". */
  "aria-label": string;
}) {
  const combobox = useCombobox();
  const submit = (picked: string) => {
    const place = placeOfOptionValue(picked);
    if (place === undefined) return;
    onChange(place);
    combobox.closeDropdown();
  };
  const label = value === undefined ? placeholder : known.labelOf(value);
  return (
    <Combobox store={combobox} onOptionSubmit={submit} width={360} position="bottom-start" shadow="md">
      <Combobox.Target targetType="button">
        <Button
          size="xs"
          variant="default"
          leftSection={value === undefined ? <MapPin size={13} /> : <PlaceFormIcon place={value} size={13} />}
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
          />
        )}
      </Combobox.Dropdown>
    </Combobox>
  );
}
