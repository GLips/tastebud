/**
 * Where a derivation applies, as one control: a button showing the scope that opens a list inline,
 * in the host's flow, so it pushes the evidence down instead of covering the statement or the next
 * card. A click anywhere on a row toggles it: ticking a folder inside a chosen repo narrows to it,
 * ticking Everywhere replaces the rest, and swapping a repo is untick then tick. Done closes it, Esc
 * puts back the scope it opened with. It only edits a draft: the host decides when the draft is
 * used, and ⌘↵ inside it is left to the host to confirm with.
 */
import { Box, Button, Combobox, Group, Paper, Text, useCombobox } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import {
  applyScopePick,
  type DerivationScope,
  describeScopeResult,
  isCompleteScope,
  type PlaceKey,
  type ScopeDraft,
  scopePickOfPlacePickerValue,
} from "@tastebud/core/places";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import { useState } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { PlaceFormIcon } from "#review/shared/ui/place-chips.tsx";
import { PlacePickerList } from "#review/shared/ui/place-picker-list.tsx";

const styles = stylex.create({
  // A full-width flex item placed last: in a host's wrapping "Applies in" row the list drops below
  // everything on that row; in a block host it is simply the next block.
  slot: { flexBasis: "100%", order: 1, width: "100%" },
  list: { maxWidth: "480px" },
});

/** The trigger's words: "Everywhere", "acme/web", "acme/web and 2 more". */
const scopeSummaryOf = (draft: ScopeDraft, labelOf: (place: PlaceKey) => string): string => {
  if (draft.scope === "global") return "Everywhere";
  const [first, ...rest] = draft.places;
  if (first === undefined) return "Pick a place";
  return rest.length === 0 ? labelOf(first) : `${labelOf(first)} and ${rest.length} more`;
};

interface ScopePickerProps {
  /** The scope being edited; may have no places while the owner is mid-change. */
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
  /** Told whenever the list opens or closes: a click on the button, Done, or Esc. */
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
  // The places Everywhere last replaced; the draft itself stays with the host.
  const [earlier, setEarlier] = useState<ReadonlyArray<PlaceKey>>(() => (value.scope === "places" ? value.places : []));
  const combobox = useCombobox({
    ...(opened !== undefined && { opened }),
    ...(onOpenedChange !== undefined && { onOpenedChange }),
  });

  // A click toggles a row and leaves the list open for the next one; only Done and Esc close it.
  const submit = (picked: string) => {
    const choice = scopePickOfPlacePickerValue(picked, value);
    if (choice === undefined) return;
    const next = applyScopePick({ draft: value, earlier }, choice);
    setEarlier(next.earlier);
    onChange(next.draft);
  };

  const summary = scopeSummaryOf(value, known.labelOf);
  const [firstPlace] = value.scope === "places" ? value.places : [];
  const triggerIcon =
    value.scope === "global" ? <Globe size={13} /> : firstPlace && <PlaceFormIcon place={firstPlace} size={13} />;
  const Chevron = combobox.dropdownOpened ? ChevronUp : ChevronDown;
  return (
    <Combobox store={combobox} onOptionSubmit={submit}>
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
      {/* No Combobox.Dropdown: the list renders in place, and only while open, so its search resets. */}
      {combobox.dropdownOpened && (
        <Box {...stylex.props(styles.slot)}>
          <Paper withBorder radius="md" p="2xs" {...stylex.props(styles.list)}>
            <PlacePickerList
              combobox={combobox}
              draft={value}
              known={known}
              scope={{ proposed, onRestore: onChange }}
              footer={
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="xs" fw={500}>
                    {describeScopeResult(value, known.labelOf)}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="default"
                    disabled={!isCompleteScope(value)}
                    onClick={() => combobox.closeDropdown()}
                  >
                    Done
                  </Button>
                </Group>
              }
            />
          </Paper>
        </Box>
      )}
    </Combobox>
  );
}
