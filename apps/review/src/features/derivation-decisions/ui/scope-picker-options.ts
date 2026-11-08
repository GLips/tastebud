/**
 * The scope picker's rows as pure logic: Everywhere, each repo with its known folders nested under
 * it, directory and named places, then what the searched text could mean as a new place. A repo
 * appears whenever one of its folders does, so widening a folder to its repo is always one row away.
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
  typedPlaceChoicesOf,
} from "@tastebud/core/places";
import { Result } from "effect";

/** Chosen: in the draft. Inside: a chosen place already covers it. Open: neither. */
type ScopePickerPlaceState = "chosen" | "inside" | "open";

export type ScopePickerOption =
  | { readonly kind: "everywhere"; readonly value: string; readonly chosen: boolean; readonly proposed: boolean }
  | {
      readonly kind: "place";
      readonly value: string;
      readonly place: PlaceKey;
      /** The folder path alone when nested under its repo's row, else the full label. */
      readonly label: string;
      readonly nested: boolean;
      readonly state: ScopePickerPlaceState;
      readonly proposed: boolean;
    }
  | {
      readonly kind: "typed";
      readonly value: string;
      readonly place: PlaceKey;
      readonly label: string;
      /** How the typed text is read: "in acme/web", "as a named place". */
      readonly meaning: string;
    }
  /** The hint row before anything is typed: picking it focuses the search. */
  | { readonly kind: "type-path"; readonly value: string }
  /** While Everywhere is chosen: go back to the places chosen before it. */
  | { readonly kind: "earlier"; readonly value: string; readonly places: ReadonlyArray<PlaceKey> };

interface ScopePickerGroup {
  /** No heading for the Everywhere row. */
  readonly heading: string | undefined;
  readonly options: ReadonlyArray<ScopePickerOption>;
}

const formOf = (place: PlaceKey) => {
  const parsed = parsePlaceKey(place);
  return Result.isSuccess(parsed) ? parsed.success.form : "named";
};

const stateOf = (draft: ScopeDraft, place: PlaceKey): ScopePickerPlaceState => {
  if (draft.scope === "global") return "open";
  if (draft.places.includes(place)) return "chosen";
  return draft.places.some((chosen) => placeCovers(chosen, place)) ? "inside" : "open";
};

const uniqueSorted = (places: Iterable<PlaceKey>, labelOf: (place: PlaceKey) => string) =>
  [...new Set(places)].sort((left, right) => labelOf(left).localeCompare(labelOf(right)));

/** The picker's groups for a draft and the searched text, with values unique across the list. */
export const scopePickerGroupsOf = ({
  draft,
  proposed,
  places,
  labelOf,
  search,
  earlier = [],
}: {
  draft: ScopeDraft;
  proposed: DerivationScope;
  /** Places the store knows; the draft's and the proposed ones are added. */
  places: ReadonlyArray<PlaceKey>;
  labelOf: (place: PlaceKey) => string;
  search: string;
  /** The places chosen before switching to Everywhere, offered back while it stays chosen. */
  earlier?: ReadonlyArray<PlaceKey>;
}): Array<ScopePickerGroup> => {
  const needle = search.trim().toLowerCase();
  const matches = (place: PlaceKey) =>
    needle === "" || place.toLowerCase().includes(needle) || labelOf(place).toLowerCase().includes(needle);
  const proposedPlaces = new Set(scopePlacesOf(proposed));
  const all = uniqueSorted([...places, ...scopePlacesOf(draft), ...proposedPlaces], labelOf);
  const repoPlaces = all.filter((place) => formOf(place) === "repo");
  const roots = uniqueSorted(repoPlaces.map(repoRootPlace), labelOf);
  const placeOption = (place: PlaceKey, label: string, nested: boolean): ScopePickerOption => ({
    kind: "place",
    value: `place:${place}`,
    place,
    label,
    nested,
    state: stateOf(draft, place),
    proposed: proposedPlaces.has(place),
  });

  const repoOptions: Array<ScopePickerOption> = [];
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
  const typed: Array<ScopePickerOption> =
    needle === ""
      ? [{ kind: "type-path", value: "type-path" }]
      : typedPlaceChoicesOf(search, {
          repoRoots: touchedRoots,
          namedPlaces: all.filter((place) => formOf(place) === "named"),
          labelOf,
        })
          .filter((choice) => !listed.has(choice.place))
          .map(({ place, label, meaning }) => ({ kind: "typed", value: `typed:${place}`, place, label, meaning }));

  const everywhereMatches = needle === "" || "everywhere".includes(needle) || "global".includes(needle);
  const everywhere: ScopePickerOption = {
    kind: "everywhere",
    value: "everywhere",
    chosen: draft.scope === "global",
    proposed: proposed.scope === "global",
  };
  const backToEarlier: Array<ScopePickerOption> =
    draft.scope === "global" && earlier.length > 0 && needle === ""
      ? [{ kind: "earlier", value: "earlier", places: earlier }]
      : [];
  return [
    { heading: undefined, options: [...(everywhereMatches ? [everywhere] : []), ...backToEarlier] },
    { heading: "Repos", options: repoOptions },
    { heading: "Folders", options: flatOptions("directory") },
    { heading: "Named places", options: flatOptions("named") },
    { heading: needle === "" ? undefined : "Use a new place", options: typed },
  ].filter((group) => group.options.length > 0);
};

/**
 * The pick a row's value stands for, read from the value alone so the list can unmount (and forget
 * its search) without the submit handler needing its rows. The type-path hint picks nothing.
 */
export const scopePickOfOptionValue = (value: string): ScopePick | undefined => {
  if (value === "everywhere" || value === "earlier") return { pick: value };
  if (value.startsWith("place:")) return { pick: "only", place: value.slice("place:".length) };
  if (value.startsWith("typed:")) return { pick: "add", place: value.slice("typed:".length) };
  return undefined;
};
