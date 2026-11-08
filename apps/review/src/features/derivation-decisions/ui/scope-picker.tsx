/**
 * Where a derivation applies, as one searchable control: a button showing the scope that opens a
 * list of Everywhere, repos with their folders, folders, named places and "use a new place". A row
 * click replaces the scope (one action to narrow, widen or move it); + adds a place beside the
 * others, as does a typed new place. It only edits a draft: whoever hosts it decides when that draft
 * is used, and ⌘↵ inside it is left to the host to confirm with.
 */
import {
  ActionIcon,
  Box,
  Button,
  Combobox,
  type ComboboxStore,
  Group,
  ScrollArea,
  Text,
  Tooltip,
  useCombobox,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import {
  applyScopePick,
  type DerivationScope,
  describeScopeResult,
  type PlaceKey,
  type ScopeDraft,
  type ScopePick,
} from "@tastebud/core/places";
import { Check, ChevronDown, CornerDownRight, Globe, Plus, Undo2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { PlaceFormIcon } from "#review/shared/ui/place-chips.tsx";

import { type ScopePickerOption, scopePickerGroupsOf, scopePickOfOptionValue } from "./scope-picker-options.ts";

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
  onPick,
}: {
  option: Extract<ScopePickerOption, { kind: "place" }>;
  draft: ScopeDraft;
  labelOf: (place: PlaceKey) => string;
  onPick: (pick: ScopePick) => void;
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
          onPick({ pick: chosen ? "remove" : "add", place: option.place });
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
  onPick,
}: {
  option: ScopePickerOption;
  draft: ScopeDraft;
  known: KnownPlaces;
  search: string;
  onPick: (pick: ScopePick) => void;
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
          <PlaceRowAction option={option} draft={draft} labelOf={known.labelOf} onPick={onPick} />
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
  /**
   * Whether the list is open, when the host owns it (to open it from a key, or to know when its
   * own Esc and ⌘↵ should wait). Leave it out and the picker owns its open state.
   */
  opened?: boolean;
  /** Told whenever the list opens or closes: a click on the button, Esc, or a row picked. */
  onOpenedChange?: (opened: boolean) => void;
  /** Uncontrolled only: open the list on mount. */
  defaultOpened?: boolean;
  disabled?: boolean;
}

/**
 * The open list. It mounts with each opening, so the search starts empty every time, whichever
 * side (picker or host) opened it.
 */
function ScopePickerList({
  combobox,
  value,
  proposed,
  known,
  earlier,
  onPick,
}: {
  combobox: ComboboxStore;
  value: ScopeDraft;
  proposed: DerivationScope;
  known: KnownPlaces;
  earlier: ReadonlyArray<PlaceKey>;
  onPick: (pick: ScopePick) => void;
}) {
  const [search, setSearch] = useState("");
  const groups = scopePickerGroupsOf({
    draft: value,
    proposed,
    places: known.places,
    labelOf: known.labelOf,
    search,
    earlier,
  });

  // Focus skips scrolling: the list is unpositioned as it mounts, and a plain focus (autoFocus,
  // focusSearchInput) jumps the page to where it briefly sits.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      combobox.searchRef.current?.focus({ preventScroll: true });
      combobox.updateSelectedOptionIndex("active");
    });
    return () => cancelAnimationFrame(frame);
  }, [combobox]);

  // Enter takes the best match: the first row once anything is typed.
  useEffect(() => {
    if (search.trim() !== "") combobox.selectFirstOption();
  }, [search, combobox]);

  return (
    <>
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
                <ScopePickerRow option={option} draft={value} known={known} search={search} onPick={onPick} />
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
    </>
  );
}

export function ScopePicker({
  value,
  proposed,
  known,
  onChange,
  opened,
  onOpenedChange,
  defaultOpened = false,
  disabled = false,
}: ScopePickerProps) {
  // The places Everywhere last replaced; the draft itself stays with the host.
  const [earlier, setEarlier] = useState<ReadonlyArray<PlaceKey>>(() => (value.scope === "places" ? value.places : []));
  const combobox = useCombobox({
    defaultOpened,
    ...(opened !== undefined && { opened }),
    ...(onOpenedChange !== undefined && { onOpenedChange }),
  });

  const pick = (choice: ScopePick) => {
    const next = applyScopePick({ draft: value, earlier }, choice);
    setEarlier(next.earlier);
    onChange(next.draft);
  };

  const submit = (picked: string) => {
    const choice = scopePickOfOptionValue(picked);
    if (choice === undefined) {
      combobox.searchRef.current?.focus({ preventScroll: true });
      return;
    }
    pick(choice);
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
        {/* Combobox keeps its dropdown mounted; the list itself must not be, or the search survives. */}
        {combobox.dropdownOpened && (
          <ScopePickerList
            combobox={combobox}
            value={value}
            proposed={proposed}
            known={known}
            earlier={earlier}
            onPick={pick}
          />
        )}
      </Combobox.Dropdown>
    </Combobox>
  );
}
