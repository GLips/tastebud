/**
 * The rows of every place picker and what a click on each does. Each repo lists its known folders
 * indented under it, so narrowing is a click; then directory and named places; then what searched
 * text could mean as a new place. The scope picker adds Everywhere on top, and a click on any row
 * toggles it, like its checkbox. A single-place select has no Everywhere and a click picks the place.
 */
import { Result } from "effect";

import { parsePlaceKey, type PlaceKey, placeCovers, repoRootPlace } from "./place-keys.ts";
import {
  relativePlacePath,
  type ScopeDraft,
  type ScopePick,
  scopePlacesReplacedBy,
  typedPlaceChoicesOf,
} from "./scope-draft.ts";
import { type DerivationScope, scopePlacesOf } from "./scope-match.ts";

/** Chosen: in the draft. Covered: a chosen place already includes it. Open: neither. */
export type PlacePickerRowState =
  | { readonly state: "chosen" | "open" }
  | { readonly state: "covered"; readonly coveredBy: PlaceKey };

/**
 * What picking a typed place does to the chosen ones, so its row can say so: it goes beside them, or
 * takes the place of those it is inside or around (or of Everywhere). A single-place select always
 * uses it, instead of nothing.
 */
export type TypedPlaceEffect =
  | { readonly effect: "add"; readonly beside: ReadonlyArray<PlaceKey> }
  | { readonly effect: "use"; readonly instead: ReadonlyArray<PlaceKey> | "everywhere" };

export type PlacePickerOption =
  | { readonly kind: "everywhere"; readonly value: string; readonly chosen: boolean; readonly proposed: boolean }
  | {
      readonly kind: "place";
      readonly value: string;
      readonly place: PlaceKey;
      /** The folder path alone when nested under its repo's row, else the full label. */
      readonly label: string;
      readonly nested: boolean;
      readonly row: PlacePickerRowState;
      readonly proposed: boolean;
    }
  | {
      readonly kind: "typed";
      readonly value: string;
      readonly place: PlaceKey;
      readonly label: string;
      /** The place's form: "as a folder", "as a named place". */
      readonly meaning: string;
      readonly effect: TypedPlaceEffect;
    };

export interface PlacePickerGroup {
  /** No heading for the Everywhere row. */
  readonly heading: string | undefined;
  readonly options: ReadonlyArray<PlacePickerOption>;
}

type PlacePickerMode = "scope" | "single";

const typedPlaceEffectOf = (mode: PlacePickerMode, draft: ScopeDraft, place: PlaceKey): TypedPlaceEffect => {
  if (mode === "single") return { effect: "use", instead: [] };
  if (draft.scope === "global") return { effect: "use", instead: "everywhere" };
  const replaced = scopePlacesReplacedBy(draft, place);
  return replaced.length > 0 || draft.places.length === 0
    ? { effect: "use", instead: replaced }
    : { effect: "add", beside: draft.places };
};

const formOf = (place: PlaceKey) => {
  const parsed = parsePlaceKey(place);
  return Result.isSuccess(parsed) ? parsed.success.form : "named";
};

const rowStateOf = (draft: ScopeDraft, place: PlaceKey): PlacePickerRowState => {
  if (draft.scope === "global") return { state: "open" };
  if (draft.places.includes(place)) return { state: "chosen" };
  const coveredBy = draft.places.find((chosen) => placeCovers(chosen, place));
  return coveredBy === undefined ? { state: "open" } : { state: "covered", coveredBy };
};

const uniqueSorted = (places: Iterable<PlaceKey>, labelOf: (place: PlaceKey) => string) =>
  [...new Set(places)].sort((left, right) => labelOf(left).localeCompare(labelOf(right)));

const NO_PROPOSAL: DerivationScope = { scope: "places", places: [] };

/** A picker's groups for a draft and the searched text, with values unique across the list. */
export const placePickerGroupsOf = ({
  mode,
  draft,
  proposed = NO_PROPOSAL,
  places,
  labelOf,
  search,
}: {
  /** `scope` offers Everywhere; `single` picks one place. */
  mode: PlacePickerMode;
  draft: ScopeDraft;
  proposed?: DerivationScope;
  /** Places the store knows; the draft's and the proposed ones are added. */
  places: ReadonlyArray<PlaceKey>;
  labelOf: (place: PlaceKey) => string;
  search: string;
}): Array<PlacePickerGroup> => {
  const needle = search.trim().toLowerCase();
  const matches = (place: PlaceKey) =>
    needle === "" || place.toLowerCase().includes(needle) || labelOf(place).toLowerCase().includes(needle);
  const proposedPlaces = new Set(scopePlacesOf(proposed));
  const all = uniqueSorted([...places, ...scopePlacesOf(draft), ...proposedPlaces], labelOf);
  const repoPlaces = all.filter((place) => formOf(place) === "repo");
  const roots = uniqueSorted(repoPlaces.map(repoRootPlace), labelOf);
  const placeOption = (place: PlaceKey, label: string, nested: boolean): PlacePickerOption => ({
    kind: "place",
    value: `place:${place}`,
    place,
    label,
    nested,
    row: rowStateOf(draft, place),
    proposed: proposedPlaces.has(place),
  });

  // A repo shows whenever one of its folders matches, so widening a folder is one row away.
  const repoOptions: Array<PlacePickerOption> = [];
  for (const root of roots) {
    const folders = repoPlaces.filter((place) => place !== root && repoRootPlace(place) === root).sort();
    const shownFolders = matches(root) ? folders : folders.filter(matches);
    if (!matches(root) && shownFolders.length === 0) continue;
    repoOptions.push(placeOption(root, labelOf(root), false));
    for (const folder of shownFolders) repoOptions.push(placeOption(folder, relativePlacePath(root, folder), true));
  }
  const flatOptions = (form: "directory" | "named") =>
    all
      .filter((place) => formOf(place) === form && matches(place))
      .map((place) => placeOption(place, labelOf(place), false));

  const listed = new Set(all.filter(matches));
  const touchedRoots = uniqueSorted(
    [...scopePlacesOf(draft), ...proposedPlaces].filter((place) => formOf(place) === "repo").map(repoRootPlace),
    labelOf,
  );
  const typed: Array<PlacePickerOption> =
    needle === ""
      ? []
      : typedPlaceChoicesOf(search, {
          repoRoots: touchedRoots,
          namedPlaces: all.filter((place) => formOf(place) === "named"),
          labelOf,
        })
          .filter((choice) => !listed.has(choice.place))
          .map(({ place, label, meaning }) => ({
            kind: "typed",
            value: `typed:${place}`,
            place,
            label,
            meaning,
            effect: typedPlaceEffectOf(mode, draft, place),
          }));

  const everywhereMatches =
    mode === "scope" && (needle === "" || "everywhere".includes(needle) || "global".includes(needle));
  const everywhere: PlacePickerOption = {
    kind: "everywhere",
    value: "everywhere",
    chosen: draft.scope === "global",
    proposed: proposed.scope === "global",
  };
  return [
    { heading: undefined, options: everywhereMatches ? [everywhere] : [] },
    { heading: "Repos", options: repoOptions },
    { heading: "Folders", options: flatOptions("directory") },
    { heading: "Named places", options: flatOptions("named") },
    { heading: "Use a new place", options: typed },
  ].filter((group) => group.options.length > 0);
};

/**
 * What a click on a scope picker row does, from its value and the draft alone, so the handler needs
 * no rows. Rows toggle: ticking a covered place narrows the one covering it, unticking Everywhere
 * goes back to what it replaced. A typed row adds its place, replacing any it overlaps.
 */
export const scopePickOfPlacePickerValue = (value: string, draft: ScopeDraft): ScopePick | undefined => {
  if (value === "everywhere") return draft.scope === "global" ? { pick: "earlier" } : { pick: "everywhere" };
  const place = placeOfPlacePickerValue(value);
  if (place === undefined) return undefined;
  const chosen = draft.scope === "places" && draft.places.includes(place);
  return { pick: chosen && value.startsWith("place:") ? "remove" : "add", place };
};

/** The place a row stands for; what a single-place select picks. Everywhere stands for none. */
export const placeOfPlacePickerValue = (value: string): PlaceKey | undefined => {
  for (const prefix of ["place:", "typed:"]) if (value.startsWith(prefix)) return value.slice(prefix.length);
  return undefined;
};
