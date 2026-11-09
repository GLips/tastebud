/**
 * The rows of every place picker, a property menu: a click on a row makes that place the scope.
 * Each repo lists its known folders indented under it, then come directory and named places, then
 * what searched text could mean as a new place. The scope picker adds Everywhere on top, and on
 * each row a side action: "+ Also" to add it beside the chosen places, or ✕ to drop one of several.
 */
import { Result } from "effect";

import { parsePlaceKey, type PlaceKey, repoRootPlace } from "./place-keys.ts";
import {
  relativePlacePath,
  type ScopeDraft,
  type ScopePick,
  scopePlacesOverlapping,
  typedPlaceChoicesOf,
} from "./scope-draft.ts";
import { type DerivationScope, scopePlacesOf } from "./scope-match.ts";

/**
 * A row's side action, beside the click that uses it. `also` adds it beside the chosen places, only
 * offered when it overlaps none of them; `remove` drops it, only when other places stay chosen.
 */
export type PlacePickerRowExtra = "also" | "remove" | undefined;

export type PlacePickerOption =
  | { readonly kind: "everywhere"; readonly value: string; readonly chosen: boolean; readonly proposed: boolean }
  | {
      readonly kind: "place";
      readonly value: string;
      readonly place: PlaceKey;
      /**
       * The folder path alone when nested under its repo's row ("only apps/checkout" while the repo
       * is chosen, since using it narrows to it), else the full label.
       */
      readonly label: string;
      readonly nested: boolean;
      readonly chosen: boolean;
      readonly proposed: boolean;
      readonly extra: PlacePickerRowExtra;
    }
  | {
      readonly kind: "typed";
      readonly value: string;
      readonly place: PlaceKey;
      readonly label: string;
      /** The place's form: "as a folder", "as a named place". */
      readonly meaning: string;
      /** What using it replaces, for "instead of …"; empty in a single-place select with nothing chosen. */
      readonly instead: ReadonlyArray<PlaceKey> | "everywhere";
      readonly extra: PlacePickerRowExtra;
    };

export interface PlacePickerGroup {
  /** No heading for the Everywhere row. */
  readonly heading: string | undefined;
  readonly options: ReadonlyArray<PlacePickerOption>;
}

type PlacePickerMode = "scope" | "single";

const extraOf = (mode: PlacePickerMode, draft: ScopeDraft, place: PlaceKey): PlacePickerRowExtra => {
  if (mode === "single" || draft.scope === "global") return undefined;
  if (draft.places.includes(place)) return draft.places.length > 1 ? "remove" : undefined;
  return draft.places.length > 0 && scopePlacesOverlapping(draft, place).length === 0 ? "also" : undefined;
};

const formOf = (place: PlaceKey) => {
  const parsed = parsePlaceKey(place);
  return Result.isSuccess(parsed) ? parsed.success.form : "named";
};

const chosenPlacesOf = (draft: ScopeDraft): ReadonlySet<PlaceKey> =>
  new Set(draft.scope === "places" ? draft.places : []);

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
  const chosen = chosenPlacesOf(draft);
  const placeOption = (place: PlaceKey, label: string, nested: boolean): PlacePickerOption => ({
    kind: "place",
    value: `place:${place}`,
    place,
    label,
    nested,
    chosen: chosen.has(place),
    proposed: proposedPlaces.has(place),
    extra: extraOf(mode, draft, place),
  });

  // A repo shows whenever one of its folders matches, so widening a folder is one row away.
  const repoOptions: Array<PlacePickerOption> = [];
  for (const root of roots) {
    const folders = repoPlaces.filter((place) => place !== root && repoRootPlace(place) === root).sort();
    const shownFolders = matches(root) ? folders : folders.filter(matches);
    if (!matches(root) && shownFolders.length === 0) continue;
    repoOptions.push(placeOption(root, labelOf(root), false));
    for (const folder of shownFolders) {
      const path = relativePlacePath(root, folder);
      repoOptions.push(placeOption(folder, mode === "scope" && chosen.has(root) ? `only ${path}` : path, true));
    }
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
            instead: draft.scope === "global" ? "everywhere" : draft.places,
            extra: extraOf(mode, draft, place),
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
 * What a click on a scope picker row does, from its value alone: use that place, or Everywhere, as
 * the whole scope. The side actions are separate buttons, so they never come through here.
 */
export const scopePickOfPlacePickerValue = (value: string): ScopePick | undefined => {
  if (value === "everywhere") return { pick: "everywhere" };
  const place = placeOfPlacePickerValue(value);
  return place === undefined ? undefined : { pick: "use", place };
};

/** The place a row stands for; what a single-place select picks. Everywhere stands for none. */
export const placeOfPlacePickerValue = (value: string): PlaceKey | undefined => {
  for (const prefix of ["place:", "typed:"]) if (value.startsWith(prefix)) return value.slice(prefix.length);
  return undefined;
};
