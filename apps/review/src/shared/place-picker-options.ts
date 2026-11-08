/**
 * The rows of every place picker as pure logic: each repo with its known folders nested under it,
 * directory and named places, then what the searched text could mean as a new place. The scope
 * picker adds Everywhere on top; a single-place select doesn't. A repo appears whenever one of its
 * folders does, so widening a folder to its repo is always one row away.
 */
import {
  type DerivationScope,
  parsePlaceKey,
  type PlaceKey,
  placeCovers,
  relativePlacePath,
  repoRootPlace,
  type ScopeDraft,
  type ScopePick,
  scopePlacesOf,
  scopePlacesReplacedBy,
  typedPlaceChoicesOf,
} from "@tastebud/core/places";
import { Result } from "effect";

/** Chosen: in the draft. Covered: a chosen place already includes it. Open: neither. */
export type PlacePickerRowState =
  | { readonly state: "chosen" | "open" }
  | { readonly state: "covered"; readonly coveredBy: PlaceKey };

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
    }
  /** While Everywhere is chosen: go back to the places chosen before it. */
  | { readonly kind: "earlier"; readonly value: string; readonly places: ReadonlyArray<PlaceKey> };

/**
 * What picking a typed place does to the chosen ones, so its row can say so: it goes beside them, or
 * takes the place of those it is inside or around (or of Everywhere). A single-place select always
 * uses it, instead of nothing.
 */
export type TypedPlaceEffect =
  | { readonly effect: "add"; readonly beside: ReadonlyArray<PlaceKey> }
  | { readonly effect: "use"; readonly instead: ReadonlyArray<PlaceKey> | "everywhere" };

const typedPlaceEffectOf = (mode: "scope" | "single", draft: ScopeDraft, place: PlaceKey): TypedPlaceEffect => {
  if (mode === "single") return { effect: "use", instead: [] };
  if (draft.scope === "global") return { effect: "use", instead: "everywhere" };
  const replaced = scopePlacesReplacedBy(draft, place);
  return replaced.length > 0 || draft.places.length === 0
    ? { effect: "use", instead: replaced }
    : { effect: "add", beside: draft.places };
};

interface PlacePickerGroup {
  /** No heading for the Everywhere row. */
  readonly heading: string | undefined;
  readonly options: ReadonlyArray<PlacePickerOption>;
}

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
  earlier = [],
}: {
  /** `scope` offers Everywhere and the way back from it; `single` picks one place. */
  mode: "scope" | "single";
  draft: ScopeDraft;
  proposed?: DerivationScope;
  /** Places the store knows; the draft's and the proposed ones are added. */
  places: ReadonlyArray<PlaceKey>;
  labelOf: (place: PlaceKey) => string;
  search: string;
  /** The places chosen before switching to Everywhere, offered back while it stays chosen. */
  earlier?: ReadonlyArray<PlaceKey>;
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
  const backToEarlier: Array<PlacePickerOption> =
    mode === "scope" && draft.scope === "global" && earlier.length > 0 && needle === ""
      ? [{ kind: "earlier", value: "earlier", places: earlier }]
      : [];
  return [
    { heading: undefined, options: [...(everywhereMatches ? [everywhere] : []), ...backToEarlier] },
    { heading: "Repos", options: repoOptions },
    { heading: "Folders", options: flatOptions("directory") },
    { heading: "Named places", options: flatOptions("named") },
    { heading: "Use a new place", options: typed },
  ].filter((group) => group.options.length > 0);
};

/**
 * The scope pick a row's value stands for, read from the value alone so the list can unmount (and
 * forget its search) without the submit handler needing its rows.
 */
export const scopePickOfOptionValue = (value: string): ScopePick | undefined => {
  if (value === "everywhere" || value === "earlier") return { pick: value };
  if (value.startsWith("place:")) return { pick: "only", place: value.slice("place:".length) };
  if (value.startsWith("typed:")) return { pick: "add", place: value.slice("typed:".length) };
  return undefined;
};

/** The place a single-place select's row stands for. */
export const placeOfOptionValue = (value: string): PlaceKey | undefined => {
  const pick = scopePickOfOptionValue(value);
  return pick !== undefined && "place" in pick ? pick.place : undefined;
};
