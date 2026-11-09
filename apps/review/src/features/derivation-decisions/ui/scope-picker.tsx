/**
 * Where a derivation applies, as a property menu: a chip showing the scope that opens a list
 * floating under it, so the host never moves. A click on a row makes that place the scope (narrow,
 * widen or move) and closes the menu; "+ Also" adds a place beside the others and keeps it open, an
 * ✕ drops one of several. Esc closes and puts back the scope it opened with. It only edits a draft:
 * the host decides when the draft is used, and ⌘↵ inside it is left to the host to confirm with.
 */
import { Button, Combobox, Text, useCombobox } from "@mantine/core";
import {
  applyScopePick,
  type DerivationScope,
  describeScopeForAgents,
  type PlaceKey,
  type ScopeDraft,
  scopePickOfPlacePickerValue,
} from "@tastebud/core/places";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { PlaceFormIcon } from "#review/shared/ui/place-chips.tsx";
import { PlacePickerList } from "#review/shared/ui/place-picker-list.tsx";

/** The trigger's words: "Everywhere", "acme/web", "acme/web and 2 more". */
const scopeSummaryOf = (draft: ScopeDraft, labelOf: (place: PlaceKey) => string): string => {
  if (draft.scope === "global") return "Everywhere";
  const [first, ...rest] = draft.places;
  if (first === undefined) return "Pick a place";
  return rest.length === 0 ? labelOf(first) : `${labelOf(first)} and ${rest.length} more`;
};

interface ScopePickerProps {
  /** The scope being edited. */
  value: ScopeDraft;
  /** The scope the agent proposed, marked "proposed" in the list. */
  proposed: DerivationScope;
  known: KnownPlaces;
  onChange: (draft: ScopeDraft) => void;
  /**
   * Whether the list is open, when the host owns it (to open it from a key, or to know when its
   * own Esc and ⌘↵ should wait). Leave it out and the picker owns its open state.
   */
  opened?: boolean;
  /** Told whenever the list opens or closes: the chip, a row used, Esc, or a click outside. */
  onOpenedChange?: (opened: boolean) => void;
  disabled?: boolean;
}

export function ScopePicker({
  value,
  proposed,
  known,
  onChange,
  opened,
  onOpenedChange,
  disabled = false,
}: ScopePickerProps) {
  const combobox = useCombobox({
    ...(opened !== undefined && { opened }),
    ...(onOpenedChange !== undefined && { onOpenedChange }),
  });

  const submit = (picked: string) => {
    const choice = scopePickOfPlacePickerValue(picked);
    if (choice === undefined) return;
    onChange(applyScopePick(value, choice));
    combobox.closeDropdown();
  };

  const summary = scopeSummaryOf(value, known.labelOf);
  const [firstPlace] = value.scope === "places" ? value.places : [];
  const triggerIcon =
    value.scope === "global" ? <Globe size={13} /> : firstPlace && <PlaceFormIcon place={firstPlace} size={13} />;
  const Chevron = combobox.dropdownOpened ? ChevronUp : ChevronDown;
  return (
    <Combobox store={combobox} onOptionSubmit={submit} width={420} position="bottom-start" shadow="md">
      <Combobox.Target targetType="button">
        <Button
          size="compact-sm"
          variant="default"
          disabled={disabled}
          leftSection={triggerIcon}
          rightSection={<Chevron size={13} />}
          aria-label={`Where this applies: ${summary}. Change`}
          onClick={() => combobox.toggleDropdown()}
        >
          {summary}
        </Button>
      </Combobox.Target>
      <Combobox.Dropdown>
        {/* Mounted only while open, so the search starts empty and Esc restores this opening's scope. */}
        {combobox.dropdownOpened && (
          <PlacePickerList
            combobox={combobox}
            draft={value}
            known={known}
            scope={{
              proposed,
              onSideAction: (pick) => onChange(applyScopePick(value, pick)),
              onRestore: onChange,
            }}
            footer={
              <Text size="xs" px="2xs" py="3xs">
                {describeScopeForAgents(value, known.labelOf)}
              </Text>
            }
          />
        )}
      </Combobox.Dropdown>
    </Combobox>
  );
}
