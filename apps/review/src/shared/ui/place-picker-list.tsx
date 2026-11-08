/**
 * The open list of a place picker: a search, then the rows from `placePickerGroupsOf`. The scope
 * picker shows it inline with a checkbox per place (add or remove) and the row's label meaning
 * "only this"; a single-place select shows it in a dropdown with no checkboxes. It mounts with each
 * opening, so the search starts empty however the list was opened.
 */
import { Box, Checkbox, Combobox, type ComboboxStore, ScrollArea, Text, TextInput } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationScope, PlaceKey, ScopeDraft } from "@tastebud/core/places";
import { Check, CornerDownRight, Globe, Plus, Undo2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";
import { type PlacePickerOption, placePickerGroupsOf } from "#review/shared/place-picker-options.ts";

import { PlaceFormIcon } from "./place-chips.tsx";

const styles = stylex.create({
  row: {
    display: "grid",
    gridTemplateColumns: "20px minmax(0, 1fr) auto",
    alignItems: "center",
    columnGap: "8px",
    minHeight: "24px",
  },
  nested: { paddingLeft: "20px" },
  label: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 },
});

/** What only the scope picker has: its proposal, the way back from Everywhere, and the checkboxes. */
export interface PlacePickerScopeRows {
  proposed: DerivationScope;
  earlier: ReadonlyArray<PlaceKey>;
  /** A checkbox changed: add the place beside the others, or remove it. */
  onToggle: (place: PlaceKey, checked: boolean) => void;
}

function LeadingIcon({ children, c = "dimmed" }: { children: ReactNode; c?: string }) {
  return (
    <Box component="span" c={c} display="flex">
      {children}
    </Box>
  );
}

function PlaceRowCheckbox({
  option,
  draft,
  scope,
  labelOf,
}: {
  option: Extract<PlacePickerOption, { kind: "place" }>;
  draft: ScopeDraft;
  scope: PlacePickerScopeRows;
  labelOf: (place: PlaceKey) => string;
}) {
  const chosen = option.row.state === "chosen";
  // The last chosen place stays: unticking it would leave a scope that applies nowhere.
  const onlyChoice = chosen && draft.scope === "places" && draft.places.length === 1;
  return (
    <Checkbox
      size="xs"
      checked={chosen}
      disabled={onlyChoice || option.row.state === "covered"}
      aria-label={chosen ? `Remove ${labelOf(option.place)}` : `Also apply in ${labelOf(option.place)}`}
      // The row behind it means "only this"; the checkbox only adds or removes.
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => scope.onToggle(option.place, event.currentTarget.checked)}
    />
  );
}

function PlaceOptionRow({
  option,
  draft,
  known,
  scope,
}: {
  option: Extract<PlacePickerOption, { kind: "place" }>;
  draft: ScopeDraft;
  known: KnownPlaces;
  scope: PlacePickerScopeRows | undefined;
}) {
  const covered = option.row.state === "covered" ? `covered by ${known.labelOf(option.row.coveredBy)}` : undefined;
  const note = [covered, option.proposed ? "proposed" : undefined].filter((part) => part !== undefined).join(" · ");
  return (
    <Box {...stylex.props(styles.row, option.nested && styles.nested)}>
      {scope === undefined ? (
        <LeadingIcon c="tastebud.6">{option.row.state === "chosen" && <Check size={14} aria-hidden />}</LeadingIcon>
      ) : (
        <PlaceRowCheckbox option={option} draft={draft} scope={scope} labelOf={known.labelOf} />
      )}
      <Box {...stylex.props(styles.label)}>
        {option.nested ? <CornerDownRight size={12} aria-hidden /> : <PlaceFormIcon place={option.place} size={13} />}
        <Text size="sm" fw={option.nested ? 400 : 500} truncate>
          {option.label}
        </Text>
      </Box>
      <Text size="xs" c="dimmed" truncate>
        {note}
      </Text>
    </Box>
  );
}

function PlacePickerRow({
  option,
  draft,
  known,
  search,
  scope,
}: {
  option: PlacePickerOption;
  draft: ScopeDraft;
  known: KnownPlaces;
  search: string;
  scope: PlacePickerScopeRows | undefined;
}) {
  switch (option.kind) {
    case "everywhere":
      return (
        <Box {...stylex.props(styles.row)}>
          <LeadingIcon c="orange.6">
            {option.chosen ? <Check size={14} aria-hidden /> : <Globe size={13} aria-hidden />}
          </LeadingIcon>
          <Box {...stylex.props(styles.label)}>
            <Text size="sm" fw={500}>
              Everywhere
            </Text>
            <Text size="xs" c="dimmed" truncate>
              every place, including future ones
            </Text>
          </Box>
          <Text size="xs" c="dimmed">
            {option.proposed ? "proposed" : ""}
          </Text>
        </Box>
      );
    case "place":
      return <PlaceOptionRow option={option} draft={draft} known={known} scope={scope} />;
    case "typed":
      return (
        <Box {...stylex.props(styles.row)}>
          <LeadingIcon>
            {scope === undefined ? <PlaceFormIcon place={option.place} size={13} /> : <Plus size={13} aria-hidden />}
          </LeadingIcon>
          <Text size="sm" truncate>
            {scope === undefined ? "Use" : "Add"}{" "}
            <Text span size="sm" fw={600}>
              “{search.trim()}”
            </Text>{" "}
            {option.meaning}
          </Text>
          <Box component="span" />
        </Box>
      );
    case "earlier":
      return (
        <Box {...stylex.props(styles.row)}>
          <LeadingIcon>
            <Undo2 size={13} aria-hidden />
          </LeadingIcon>
          <Text size="sm" truncate>
            Back to {option.places.map(known.labelOf).join(", ")}
          </Text>
          <Box component="span" />
        </Box>
      );
  }
}

export function PlacePickerList({
  combobox,
  draft,
  known,
  scope,
  footer,
}: {
  combobox: ComboboxStore;
  /** The chosen places; a single-place select passes its one place, or none. */
  draft: ScopeDraft;
  known: KnownPlaces;
  /** Present for the scope picker; a single-place select leaves it out. */
  scope?: PlacePickerScopeRows;
  footer?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const groups = placePickerGroupsOf({
    mode: scope === undefined ? "single" : "scope",
    draft,
    ...(scope !== undefined && { proposed: scope.proposed, earlier: scope.earlier }),
    places: known.places,
    labelOf: known.labelOf,
    search,
  });

  // Focus skips scrolling: a list mounting into a dropdown is unpositioned for a frame, and a plain
  // focus (autoFocus, focusSearchInput) jumps the page to where it briefly sits.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
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
      {/* A plain input as the events target rather than Combobox.Search, whose sizing assumes a dropdown. */}
      <Combobox.EventsTarget>
        <TextInput
          ref={searchRef}
          size="xs"
          mb="2xs"
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
      </Combobox.EventsTarget>
      <Combobox.Options>
        <ScrollArea.Autosize mah={320} type="scroll">
          {groups.map((group) => {
            const rows = group.options.map((option) => (
              <Combobox.Option
                key={option.value}
                value={option.value}
                active={
                  (option.kind === "place" && option.row.state === "chosen") ||
                  (option.kind === "everywhere" && option.chosen)
                }
              >
                <PlacePickerRow option={option} draft={draft} known={known} search={search} scope={scope} />
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
        {search.trim() === "" && (
          <Text size="xs" c="dimmed" px="xs" py="2xs">
            Not listed? Type a folder like apps/admin, or a name.
          </Text>
        )}
      </Combobox.Options>
      {footer !== undefined && <Combobox.Footer>{footer}</Combobox.Footer>}
    </>
  );
}
