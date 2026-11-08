/**
 * Where a derivation applies, as one searchable control: a button showing the scope that opens a
 * list of Everywhere, repos with their folders, folders, named places and "use a new place". A row
 * click replaces the scope (one action to narrow, widen or move it); + adds a place beside the
 * others, as does a typed new place. It only edits a draft: whoever hosts it decides when that draft
 * is used, and ⌘↵ inside it is left to the host to confirm with.
 */
import { ActionIcon, Box, Button, Combobox, Group, ScrollArea, Text, Tooltip, useCombobox } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationScope, PlaceKey } from "@tastebud/core/places";
import { Check, ChevronDown, CornerDownRight, Globe, Plus, Undo2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { PlaceFormIcon } from "#review/shared/ui/place-chips.tsx";

import { describeScopeResult, type ScopeDraft, withoutPlace, withPlace } from "./scope-draft.ts";
import { type ScopePickerOption, scopePickerGroupsOf } from "./scope-picker-options.ts";

const styles = stylex.create({
  row: {
    display: "grid",
    gridTemplateColumns: "16px minmax(0, 1fr) auto",
    alignItems: "center",
    columnGap: "8px",
    minHeight: "24px",
  },
  nested: { paddingLeft: "20px" },
  label: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 },
});

/** The trigger's words: "Everywhere", "acme/web", "acme/web and 2 more". */
const scopeSummaryOf = (draft: ScopeDraft, labelOf: (place: PlaceKey) => string): string => {
  if (draft.scope === "global") return "Everywhere";
  const [first, ...rest] = draft.places;
  if (first === undefined) return "Pick a place";
  return rest.length === 0 ? labelOf(first) : `${labelOf(first)} and ${rest.length} more`;
};

function ChosenMark({ state }: { state: "chosen" | "inside" | "open" }) {
  if (state === "open") return <Box component="span" />;
  return (
    <Box component="span" c={state === "chosen" ? "tastebud.6" : "gray.5"} display="flex">
      <Check size={14} aria-hidden />
    </Box>
  );
}

function PlaceRowAction({
  option,
  draft,
  labelOf,
  onChange,
}: {
  option: Extract<ScopePickerOption, { kind: "place" }>;
  draft: ScopeDraft;
  labelOf: (place: PlaceKey) => string;
  onChange: (draft: ScopeDraft) => void;
}) {
  const chosen = option.state === "chosen";
  // From Everywhere a row click already limits to that place, so "add" would mean the same.
  if (draft.scope === "global" || (chosen && draft.places.length === 1)) return null;
  const label = chosen ? `Remove ${labelOf(option.place)}` : `Also apply in ${labelOf(option.place)}`;
  return (
    <Tooltip label={label} withArrow position="right">
      <ActionIcon
        size="sm"
        variant="subtle"
        color="gray"
        aria-label={label}
        onClick={(event) => {
          // The row behind it replaces the scope; this button only adds or removes.
          event.stopPropagation();
          onChange(chosen ? withoutPlace(draft, option.place) : withPlace(draft, option.place));
        }}
      >
        {chosen ? <X size={13} /> : <Plus size={13} />}
      </ActionIcon>
    </Tooltip>
  );
}

function ScopePickerRow({
  option,
  draft,
  known,
  search,
  onChange,
}: {
  option: ScopePickerOption;
  draft: ScopeDraft;
  known: KnownPlaces;
  search: string;
  onChange: (draft: ScopeDraft) => void;
}) {
  switch (option.kind) {
    case "everywhere":
      return (
        <Box {...stylex.props(styles.row)}>
          <ChosenMark state={option.chosen ? "chosen" : "open"} />
          <Box {...stylex.props(styles.label)}>
            <Box component="span" c="orange.6" display="flex">
              <Globe size={13} aria-hidden />
            </Box>
            <Text size="sm" fw={500}>
              Everywhere
            </Text>
            <Text size="xs" c="dimmed" truncate>
              every place, including future ones
            </Text>
          </Box>
          {option.proposed ? (
            <Text size="xs" c="dimmed">
              proposed
            </Text>
          ) : (
            <Box component="span" />
          )}
        </Box>
      );
    case "place":
      return (
        <Box {...stylex.props(styles.row, option.nested && styles.nested)}>
          <ChosenMark state={option.state} />
          <Box {...stylex.props(styles.label)}>
            {option.nested ? (
              <CornerDownRight size={12} aria-hidden />
            ) : (
              <PlaceFormIcon place={option.place} size={13} />
            )}
            <Text size="sm" fw={option.nested ? 400 : 500} truncate>
              {option.label}
            </Text>
            {option.proposed && (
              <Text size="xs" c="dimmed">
                proposed
              </Text>
            )}
          </Box>
          <PlaceRowAction option={option} draft={draft} labelOf={known.labelOf} onChange={onChange} />
        </Box>
      );
    case "typed":
      return (
        <Box {...stylex.props(styles.row)}>
          <Box component="span" c="dimmed" display="flex">
            <Plus size={13} aria-hidden />
          </Box>
          <Box {...stylex.props(styles.label)}>
            <PlaceFormIcon place={option.place} size={13} />
            <Text size="sm" truncate>
              Add{" "}
              <Text span size="sm" fw={600}>
                “{search.trim()}”
              </Text>{" "}
              {option.meaning}
            </Text>
          </Box>
          <Box component="span" />
        </Box>
      );
    case "earlier":
      return (
        <Box {...stylex.props(styles.row)}>
          <Box component="span" c="dimmed" display="flex">
            <Undo2 size={13} aria-hidden />
          </Box>
          <Text size="sm" truncate>
            Back to {option.places.map(known.labelOf).join(", ")}
          </Text>
          <Box component="span" />
        </Box>
      );
    case "type-path":
      return (
        <Box {...stylex.props(styles.row)}>
          <Box component="span" />
          <Text size="sm" c="dimmed">
            Use a path… type a folder or a name
          </Text>
          <Box component="span" />
        </Box>
      );
  }
}

interface ScopePickerProps {
  /** The scope being edited; may have no places while the owner is mid-change. */
  value: ScopeDraft;
  /** The scope the agent proposed, marked "proposed" in the list. */
  proposed: DerivationScope;
  known: KnownPlaces;
  onChange: (draft: ScopeDraft) => void;
  /** Open the list on mount, for hosts that show the picker in answer to a click on "Edit". */
  defaultOpened?: boolean;
  /** Told when the list opens or closes, so a host's own Esc can wait for the list's. */
  onOpenedChange?: (opened: boolean) => void;
  disabled?: boolean;
}

export function ScopePicker({
  value,
  proposed,
  known,
  onChange,
  defaultOpened = false,
  onOpenedChange,
  disabled = false,
}: ScopePickerProps) {
  const [search, setSearch] = useState("");
  // Everywhere and back again restores the places chosen before it, not a blank list.
  const [earlier, setEarlier] = useState<ReadonlyArray<PlaceKey>>(() => (value.scope === "places" ? value.places : []));
  const combobox = useCombobox({
    defaultOpened,
    ...(onOpenedChange !== undefined && { onOpenedChange }),
    onDropdownOpen: () => combobox.updateSelectedOptionIndex("active"),
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch("");
    },
  });
  const groups = scopePickerGroupsOf({
    draft: value,
    proposed,
    places: known.places,
    labelOf: known.labelOf,
    search,
    earlier,
  });
  const options = new Map(groups.flatMap((group) => group.options.map((option) => [option.value, option] as const)));

  // Focus the search without scrolling: the list is still unpositioned when it mounts, and a plain
  // focus (autoFocus, focusSearchInput) jumps the page to where it briefly sits.
  useEffect(() => {
    if (!combobox.dropdownOpened) return;
    const frame = requestAnimationFrame(() => combobox.searchRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [combobox.dropdownOpened, combobox.searchRef]);

  // Enter takes the best match: the first row once anything is typed.
  useEffect(() => {
    if (search.trim() !== "") combobox.selectFirstOption();
  }, [search, combobox]);

  const submit = (picked: string) => {
    const option = options.get(picked);
    if (option === undefined) return;
    if (option.kind === "type-path") {
      combobox.searchRef.current?.focus({ preventScroll: true });
      return;
    }
    if (option.kind === "typed") {
      onChange(withPlace(value, option.place));
      setSearch("");
      return;
    }
    if (option.kind === "everywhere" && value.scope === "places" && value.places.length > 0) setEarlier(value.places);
    onChange(
      option.kind === "everywhere"
        ? { scope: "global" }
        : { scope: "places", places: option.kind === "earlier" ? option.places : [option.place] },
    );
    combobox.closeDropdown();
  };

  const summary = scopeSummaryOf(value, known.labelOf);
  const [firstPlace] = value.scope === "places" ? value.places : [];
  const triggerIcon =
    value.scope === "global" ? <Globe size={13} /> : firstPlace && <PlaceFormIcon place={firstPlace} size={13} />;
  return (
    <Combobox store={combobox} onOptionSubmit={submit} width={360} position="bottom-start" shadow="md">
      <Combobox.Target targetType="button">
        <Button
          size="compact-sm"
          variant="default"
          disabled={disabled}
          leftSection={triggerIcon}
          rightSection={<ChevronDown size={13} />}
          aria-label={`Where this applies: ${summary}. Change`}
          onClick={() => combobox.toggleDropdown()}
        >
          {summary}
        </Button>
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Search
          value={search}
          aria-label="Search places, or type a new one"
          placeholder="Search places, or type a folder or name"
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            combobox.updateSelectedOptionIndex();
          }}
          onKeyDown={(event) => {
            // ⌘↵ belongs to the host's confirm; without this the list would also take the active row.
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) combobox.resetSelectedOption();
          }}
        />
        <Combobox.Options>
          <ScrollArea.Autosize mah={340} type="scroll">
            {groups.map((group) => {
              const rows = group.options.map((option) => (
                <Combobox.Option
                  key={option.value}
                  value={option.value}
                  active={
                    (option.kind === "place" && option.state === "chosen") ||
                    (option.kind === "everywhere" && option.chosen)
                  }
                >
                  <ScopePickerRow option={option} draft={value} known={known} search={search} onChange={onChange} />
                </Combobox.Option>
              ));
              return group.heading === undefined ? (
                rows
              ) : (
                <Combobox.Group key={group.heading} label={group.heading}>
                  {rows}
                </Combobox.Group>
              );
            })}
          </ScrollArea.Autosize>
        </Combobox.Options>
        <Combobox.Footer>
          <Group gap="xxs" wrap="nowrap">
            <Text size="xs" fw={500} {...(value.scope === "global" && { c: "orange.8" })}>
              {describeScopeResult(value, known.labelOf)}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            Click a place to use only it · + adds it beside the others
          </Text>
        </Combobox.Footer>
      </Combobox.Dropdown>
    </Combobox>
  );
}
