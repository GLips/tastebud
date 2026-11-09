/**
 * Where a derivation applies, as a property menu: a chip showing the scope that opens a list
 * floating under it, so the host never moves. A click on a row makes that place the scope (narrow,
 * widen or move) and closes the menu; "+ Also" adds a place beside the others and keeps it open, an
 * ✕ drops one of several. Esc closes and keeps what was done; Restore under it goes back. It only edits a draft:
 * the host decides when the draft is used, and ⌘↵ inside it is left to the host to confirm with.
 */
import { Anchor, Button, Combobox, Group, Stack, Text, useCombobox } from "@mantine/core";
import {
  applyScopePick,
  type DerivationScope,
  describeScopeForAgents,
  isSameScope,
  type PlaceKey,
  type ScopeDraft,
  scopePickOfPlacePickerValue,
} from "@tastebud/core/places";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import { useCallback, useState } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { PlaceFormIcon } from "#review/shared/ui/place-chips.tsx";
import { PlacePickerList } from "#review/shared/ui/place-picker-list.tsx";
import { ScopeGuessedChip } from "#review/shared/ui/status-chips.tsx";

/** On the box the list must stay inside (the page's rail); without one it keeps to the viewport. */
const SCOPE_PICKER_BOUNDS = "data-scope-picker-bounds";

/** The trigger's words, short enough for the properties column: "Everywhere", "acme/web", "acme/web +2". */
const scopeSummaryOf = (draft: ScopeDraft, labelOf: (place: PlaceKey) => string): string => {
  if (draft.scope === "global") return "Everywhere";
  const [first, ...rest] = draft.places;
  if (first === undefined) return "Pick a place";
  return rest.length === 0 ? labelOf(first) : `${labelOf(first)} +${rest.length}`;
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

function ScopePicker({
  value,
  proposed,
  known,
  onChange,
  opened,
  onOpenedChange,
  disabled = false,
  bounds,
}: ScopePickerProps & { bounds: Element | null }) {
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
    // Under its trigger, like Linear's property menus: it may cover the evidence for a moment but never
    // flips up over the title, the state or the decision buttons. Shift keeps it inside the pane.
    <Combobox
      store={combobox}
      onOptionSubmit={submit}
      width={320}
      position="bottom-start"
      middlewares={{ flip: false, shift: bounds === null ? true : { boundary: bounds } }}
      shadow="md"
    >
      <Combobox.Target targetType="button">
        <Button
          variant="default"
          maw="100%"
          disabled={disabled}
          leftSection={triggerIcon}
          rightSection={<Chevron size={13} />}
          title={value.scope === "places" ? value.places.map(known.labelOf).join(", ") : undefined}
          aria-label={`Where this applies: ${summary}. Change`}
          onClick={() => combobox.toggleDropdown()}
        >
          {summary}
        </Button>
      </Combobox.Target>
      <Combobox.Dropdown>
        {/* Mounted only while open, so the search starts empty on each opening. */}
        {combobox.dropdownOpened && (
          <PlacePickerList
            combobox={combobox}
            draft={value}
            known={known}
            scope={{
              proposed,
              onSideAction: (pick) => onChange(applyScopePick(value, pick)),
            }}
            footer={
              // What agents will be told only matters once it differs from what was proposed.
              isSameScope(proposed, value) ? undefined : (
                <Text size="xs" px="2xs" py="3xs">
                  {describeScopeForAgents(value, known.labelOf)}
                </Text>
              )
            }
          />
        )}
      </Combobox.Dropdown>
    </Combobox>
  );
}

/**
 * The Scope property: the picker, then either what an edit changes with a way back to the scope it
 * started from, or a "guessed" tag when the agent defaulted the scope to where it was working.
 */
export function ScopePropertyField({
  picker,
  changes,
  guessed,
  onRestore,
}: {
  picker: ScopePickerProps;
  /** How the draft differs from where it started, a phrase each; empty when it doesn't. */
  changes: ReadonlyArray<string>;
  guessed: boolean;
  /** Drops the draft; omitted while the draft can't be changed. */
  onRestore: (() => void) | undefined;
}) {
  // The list is wider than the rail, so it shifts left to end at the rail's edge rather than past it.
  const [bounds, setBounds] = useState<Element | null>(null);
  const findBounds = useCallback(
    (node: HTMLElement | null) => setBounds(node?.closest(`[${SCOPE_PICKER_BOUNDS}]`) ?? null),
    [],
  );
  return (
    <Stack ref={findBounds} gap="2xs" align="flex-start">
      {/* Capped at the column and wrapping, so a long scope truncates and "guessed" drops under it. */}
      <Group gap="xs" maw="100%">
        {/* Remounted once the rail is found: floating-ui compares middlewares by their source text, so a
            boundary arriving after the first render would otherwise never reach the list. */}
        <ScopePicker key={bounds === null ? "viewport" : "bounded"} {...picker} bounds={bounds} />
        {guessed && changes.length === 0 && picker.opened !== true && <ScopeGuessedChip />}
      </Group>
      {changes.length > 0 && (
        <Text size="xs" c="gray.7">
          {changes.join(" · ")}
          {onRestore !== undefined && (
            <>
              {" · "}
              <Anchor component="button" size="xs" onClick={onRestore}>
                Restore
              </Anchor>
            </>
          )}
        </Text>
      )}
    </Stack>
  );
}
