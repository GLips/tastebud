/**
 * The open list of a place picker: a search, then the rows from `placePickerGroupsOf`. In the scope
 * picker every row shows a checkbox and a click anywhere on it toggles it; a single-place select
 * shows a check on its place and a click picks it. It mounts with each opening, so the search starts
 * empty however the list was opened, and it remembers the draft it opened with for Esc.
 */
import { Box, Checkbox, Combobox, type ComboboxStore, ScrollArea, Text, TextInput } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import {
  type DerivationScope,
  type PlaceKey,
  type PlacePickerOption,
  placePickerGroupsOf,
  type ScopeDraft,
} from "@tastebud/core/places";
import { Check, CornerDownRight, Globe, Plus } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";

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
  // Fades the row's own colour rather than taking a dimmed one, so it stays readable on the
  // highlighted row's filled background as well as on the plain one.
  note: { opacity: 0.75 },
});

/** What only the scope picker has: its proposal, and the way Esc puts back the opening draft. */
export interface PlacePickerScopeRows {
  proposed: DerivationScope;
  /** Esc: the draft the list opened with, to restore before it closes. */
  onRestore: (draft: ScopeDraft) => void;
}

function LeadingIcon({ children, c = "dimmed" }: { children: ReactNode; c?: string }) {
  return (
    <Box component="span" c={c} display="flex">
      {children}
    </Box>
  );
}

function RowNote({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" truncate {...stylex.props(styles.note)}>
      {children}
    </Text>
  );
}

function PlaceOptionRow({
  option,
  known,
  scoped,
}: {
  option: Extract<PlacePickerOption, { kind: "place" }>;
  known: KnownPlaces;
  /** The scope picker's row, with a checkbox and what a covered place's tick does. */
  scoped: boolean;
}) {
  const chosen = option.row.state === "chosen";
  const covered = scoped && option.row.state === "covered" ? option.row.coveredBy : undefined;
  const note = [
    covered === undefined ? undefined : `in ${known.labelOf(covered)} · tick to narrow`,
    option.proposed ? "proposed" : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
  return (
    <Box {...stylex.props(styles.row, option.nested && styles.nested)}>
      {scoped ? (
        <Checkbox.Indicator size="xs" checked={chosen} indeterminate={covered !== undefined} />
      ) : (
        <LeadingIcon c="tastebud.6">{chosen && <Check size={14} aria-hidden />}</LeadingIcon>
      )}
      <Box {...stylex.props(styles.label)}>
        {option.nested ? <CornerDownRight size={12} aria-hidden /> : <PlaceFormIcon place={option.place} size={13} />}
        <Text size="sm" fw={option.nested ? 400 : 500} truncate>
          {option.label}
        </Text>
      </Box>
      <RowNote>{note}</RowNote>
    </Box>
  );
}

/** "acme/web", "acme/web and 2 more". */
const placesPhrase = (places: ReadonlyArray<PlaceKey>, labelOf: (place: PlaceKey) => string): string => {
  const [first, ...rest] = places;
  if (first === undefined) return "";
  return rest.length === 0 ? labelOf(first) : `${labelOf(first)} and ${rest.length} more`;
};

/**
 * A typed place, worded by what picking it does: "Add clients/globex as a named place, beside
 * acme/web" when it joins the chosen places, "Use acme/web › apps/product as a folder, instead of
 * acme/web" when it takes the place of one it is inside or around.
 */
function TypedOptionRow({
  option,
  labelOf,
}: {
  option: Extract<PlacePickerOption, { kind: "typed" }>;
  labelOf: (place: PlaceKey) => string;
}) {
  const { effect } = option;
  let note = "";
  if (effect.effect === "add") note = `beside ${placesPhrase(effect.beside, labelOf)}`;
  else if (effect.instead === "everywhere") note = "instead of Everywhere";
  else if (effect.instead.length > 0) note = `instead of ${placesPhrase(effect.instead, labelOf)}`;
  return (
    <Box {...stylex.props(styles.row)}>
      <LeadingIcon>
        {effect.effect === "add" ? <Plus size={13} aria-hidden /> : <PlaceFormIcon place={option.place} size={13} />}
      </LeadingIcon>
      {/* The effect goes under the place rather than beside it: both are long enough to crowd one line. */}
      <Box miw={0}>
        <Text size="sm" truncate>
          {effect.effect === "add" ? "Add" : "Use"}{" "}
          <Text span size="sm" fw={600}>
            {option.label}
          </Text>{" "}
          {option.meaning}
        </Text>
        {note !== "" && <RowNote>{note}</RowNote>}
      </Box>
      <Box component="span" />
    </Box>
  );
}

function PlacePickerRow({ option, known, scoped }: { option: PlacePickerOption; known: KnownPlaces; scoped: boolean }) {
  switch (option.kind) {
    case "everywhere":
      return (
        <Box {...stylex.props(styles.row)}>
          <Checkbox.Indicator size="xs" checked={option.chosen} />
          <Box {...stylex.props(styles.label)}>
            <Globe size={13} aria-hidden />
            <Text size="sm" fw={500}>
              Everywhere
            </Text>
            <Text size="xs" truncate {...stylex.props(styles.note)}>
              every place, including future ones
            </Text>
          </Box>
          <RowNote>{option.proposed ? "proposed" : ""}</RowNote>
        </Box>
      );
    case "place":
      return <PlaceOptionRow option={option} known={known} scoped={scoped} />;
    case "typed":
      return <TypedOptionRow option={option} labelOf={known.labelOf} />;
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
  const [openingDraft] = useState(draft);
  const searchRef = useRef<HTMLInputElement>(null);
  const groups = placePickerGroupsOf({
    mode: scope === undefined ? "single" : "scope",
    draft,
    ...(scope !== undefined && { proposed: scope.proposed }),
    places: known.places,
    labelOf: known.labelOf,
    search,
  });

  // The store object is new on every render but its methods are stable. Depending on the object
  // re-ran the mount effect on any re-render, moving the selection to the chosen row (or none) after
  // a search had selected its first row, so Enter then did nothing.
  const { updateSelectedOptionIndex, selectFirstOption } = combobox;

  // Once, on opening. Focus skips scrolling: a list mounting into a dropdown is unpositioned for a
  // frame, and a plain focus (autoFocus, focusSearchInput) jumps the page to where it briefly sits.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
      updateSelectedOptionIndex("active");
    });
    return () => cancelAnimationFrame(frame);
  }, [updateSelectedOptionIndex]);

  // Enter takes the best match: the first row once anything is typed.
  useEffect(() => {
    if (search.trim() !== "") selectFirstOption();
  }, [search, selectFirstOption]);

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
            // Runs before the combobox's own Esc, which then closes the list.
            if (event.key === "Escape") scope?.onRestore(openingDraft);
          }}
        />
      </Combobox.EventsTarget>
      <Combobox.Options>
        {/* Scrolls inside, so the footer and its Done stay in view however many places there are. */}
        <ScrollArea.Autosize mah={280} type="auto">
          {groups.map((group) => {
            const rows = group.options.map((option) => (
              <Combobox.Option
                key={option.value}
                value={option.value}
                active={
                  (option.kind === "place" && option.row.state === "chosen") ||
                  (option.kind === "everywhere" && option.chosen)
                }
                // A typed place, once picked, is listed among the known ones: show them again.
                {...(option.kind === "typed" && { onClick: () => setSearch("") })}
              >
                <PlacePickerRow option={option} known={known} scoped={scope !== undefined} />
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
