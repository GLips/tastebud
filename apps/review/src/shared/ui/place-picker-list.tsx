/**
 * The open list of a place picker, a property menu: a search, then the rows from
 * `placePickerGroupsOf`. A click on a row uses it; a chosen row shows a check. In the scope picker a
 * row also carries a quiet "+ Also" (add it beside the chosen places) or an ✕ (drop one of several).
 * It mounts with each opening, so the search starts empty, and it remembers the draft it opened with
 * for Esc.
 */
import { ActionIcon, Box, Button, Combobox, type ComboboxStore, ScrollArea, Text, TextInput } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import {
  type DerivationScope,
  type PlaceKey,
  type PlacePickerOption,
  placePickerGroupsOf,
  type ScopeDraft,
  type ScopeSideAction,
} from "@tastebud/core/places";
import { Check, CornerDownRight, Globe, Plus, X } from "lucide-react";
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";

import { PlaceFormIcon } from "./place-chips.tsx";

const styles = stylex.create({
  row: {
    display: "grid",
    gridTemplateColumns: "16px minmax(0, 1fr) auto",
    alignItems: "center",
    columnGap: "8px",
    minHeight: "26px",
  },
  nested: { paddingLeft: "20px" },
  label: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 },
  // Fades the row's own colour rather than taking a dimmed one, so it stays readable on the
  // highlighted row's filled background as well as on the plain one.
  note: { opacity: 0.75, flexShrink: 0 },
});

/** What only the scope picker has: its proposal, the side actions, and the way Esc restores. */
export interface PlacePickerScopeRows {
  proposed: DerivationScope;
  /** "+ Also" or ✕ on a row: an edit that keeps the menu open. */
  onSideAction: (pick: ScopeSideAction) => void;
  /** Esc: the draft the list opened with, to restore before it closes. */
  onRestore: (draft: ScopeDraft) => void;
}

/** A row of the host's own above the places, like Recall's "Nowhere in particular". */
export interface PlacePickerLeadingRow {
  readonly value: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly chosen: boolean;
}

function CheckMark({ shown }: { shown: boolean }) {
  return (
    <Box component="span" c="tastebud.6" display="flex">
      {shown && <Check size={14} aria-hidden />}
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

/** "+ Also" or ✕. Neither takes focus from the search nor reaches the row's own click. */
function SideAction({
  extra,
  label,
  onPick,
}: {
  extra: "also" | "remove" | undefined;
  label: string;
  onPick: (pick: "add" | "remove") => void;
}) {
  if (extra === undefined) return <Box component="span" />;
  const shared = {
    onMouseDown: (event: MouseEvent) => event.preventDefault(),
    onClick: (event: MouseEvent) => {
      event.stopPropagation();
      onPick(extra === "also" ? "add" : "remove");
    },
  };
  return extra === "also" ? (
    <Button
      size="compact-xs"
      variant="subtle"
      color="gray"
      leftSection={<Plus size={12} aria-hidden />}
      aria-label={`Also apply in ${label}`}
      {...shared}
    >
      Also
    </Button>
  ) : (
    <ActionIcon size="sm" variant="subtle" color="gray" aria-label={`Remove ${label}`} {...shared}>
      <X size={12} aria-hidden />
    </ActionIcon>
  );
}

/** "acme/web", "acme/web and 2 more". */
const placesPhrase = (places: ReadonlyArray<PlaceKey>, labelOf: (place: PlaceKey) => string): string => {
  const [first, ...rest] = places;
  if (first === undefined) return "";
  return rest.length === 0 ? labelOf(first) : `${labelOf(first)} and ${rest.length} more`;
};

function PlacePickerRow({
  option,
  known,
  scope,
  onSideAction,
}: {
  option: PlacePickerOption;
  known: KnownPlaces;
  scope: PlacePickerScopeRows | undefined;
  onSideAction: (pick: ScopeSideAction) => void;
}) {
  switch (option.kind) {
    case "everywhere":
      return (
        <Box {...stylex.props(styles.row)}>
          <CheckMark shown={option.chosen} />
          <Box {...stylex.props(styles.label)}>
            <Globe size={13} aria-hidden />
            <Text size="sm" fw={500}>
              Everywhere
            </Text>
            <RowNote>{option.proposed ? "proposed" : "every place, including future ones"}</RowNote>
          </Box>
          <Box component="span" />
        </Box>
      );
    case "place":
      return (
        <Box {...stylex.props(styles.row, option.nested && styles.nested)}>
          <CheckMark shown={option.chosen} />
          <Box {...stylex.props(styles.label)}>
            {option.nested ? (
              <CornerDownRight size={12} aria-hidden />
            ) : (
              <PlaceFormIcon place={option.place} size={13} />
            )}
            <Text size="sm" fw={option.nested ? 400 : 500} truncate>
              {option.label}
            </Text>
            {option.proposed && <RowNote>proposed</RowNote>}
          </Box>
          <SideAction
            extra={option.extra}
            label={known.labelOf(option.place)}
            onPick={(pick) => onSideAction({ pick, place: option.place })}
          />
        </Box>
      );
    case "typed": {
      const instead = option.instead === "everywhere" ? "Everywhere" : placesPhrase(option.instead, known.labelOf);
      return (
        <Box {...stylex.props(styles.row)}>
          <Box component="span" c="dimmed" display="flex">
            <PlaceFormIcon place={option.place} size={13} />
          </Box>
          {/* What it replaces goes under the place: both are long enough to crowd one line. */}
          <Box miw={0}>
            <Text size="sm" truncate>
              Use{" "}
              <Text span size="sm" fw={600}>
                {option.label}
              </Text>{" "}
              {option.meaning}
            </Text>
            {scope !== undefined && instead !== "" && <RowNote>instead of {instead}</RowNote>}
          </Box>
          <SideAction
            extra={option.extra}
            label={option.label}
            onPick={(pick) => onSideAction({ pick, place: option.place })}
          />
        </Box>
      );
    }
  }
}

const NO_LEADING_ROWS: ReadonlyArray<PlacePickerLeadingRow> = [];

export function PlacePickerList({
  combobox,
  draft,
  known,
  scope,
  leadingRows = NO_LEADING_ROWS,
  footer,
}: {
  combobox: ComboboxStore;
  /** The chosen places; a single-place select passes its one place, or none. */
  draft: ScopeDraft;
  known: KnownPlaces;
  /** Present for the scope picker; a single-place select leaves it out. */
  scope?: PlacePickerScopeRows;
  /** The host's own rows, listed first while nothing is searched. */
  leadingRows?: ReadonlyArray<PlacePickerLeadingRow>;
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

  // A place added from the search is listed among the known ones: show them again.
  const sideAction = (pick: ScopeSideAction) => {
    scope?.onSideAction(pick);
    setSearch("");
  };

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
          // While open the menu owns Enter, ⌘↵ and Esc: none may reach the host's accept or back.
          // Esc in the capture phase: the popover closes on Esc while capturing, which unmounts this
          // list before any bubbling handler of its own could restore the opening scope.
          onKeyDownCapture={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            scope?.onRestore(openingDraft);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.stopPropagation();
            // Runs before the combobox's own Enter, which uses the selected row; with none, just close.
            if (combobox.getSelectedOptionIndex() === -1) combobox.closeDropdown();
          }}
        />
      </Combobox.EventsTarget>
      <Combobox.Options>
        <ScrollArea.Autosize mah={300} type="auto">
          {search.trim() === "" &&
            leadingRows.map((row) => (
              <Combobox.Option key={row.value} value={row.value} active={row.chosen}>
                <Box {...stylex.props(styles.row)}>
                  <CheckMark shown={row.chosen} />
                  <Box {...stylex.props(styles.label)}>
                    {row.icon}
                    <Text size="sm" fw={500} truncate>
                      {row.label}
                    </Text>
                  </Box>
                  <Box component="span" />
                </Box>
              </Combobox.Option>
            ))}
          {groups.map((group) => {
            const rows = group.options.map((option) => (
              <Combobox.Option
                key={option.value}
                value={option.value}
                active={option.kind !== "typed" && option.chosen}
              >
                <PlacePickerRow option={option} known={known} scope={scope} onSideAction={sideAction} />
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
