/**
 * The inbox's scope editor as pure logic: a draft that may be invalid (no places yet), what it
 * changes against the proposed scope in plain words, and the places a scope place can narrow to.
 * Removing the last place never means global; global is only ever chosen outright.
 */
import { Result } from "effect";

import {
  canonicalPlaceKey,
  type DerivationScope,
  formatPlaceLabel,
  parsePlaceKey,
  type PlaceKey,
  placeCovers,
  REPO_PLACE_SEPARATOR,
  scopeGroupKey,
  scopePlacesOf,
} from "../shared/places.ts";

export type ScopeDraft =
  | { readonly scope: "global" }
  | { readonly scope: "places"; readonly places: ReadonlyArray<PlaceKey> };

export const isCompleteScope = (draft: ScopeDraft): draft is DerivationScope =>
  draft.scope === "global" || draft.places.length > 0;

const scopeDraftKey = (draft: ScopeDraft): string => (isCompleteScope(draft) ? scopeGroupKey(draft) : "(no places)");

export const isSameScope = (left: ScopeDraft, right: ScopeDraft): boolean =>
  scopeDraftKey(left) === scopeDraftKey(right);

export const withoutPlace = (draft: ScopeDraft, place: PlaceKey): ScopeDraft =>
  draft.scope === "global" ? draft : { scope: "places", places: draft.places.filter((kept) => kept !== place) };

export const withPlace = (draft: ScopeDraft, place: PlaceKey): ScopeDraft => {
  const places = scopePlacesOf(draft);
  return { scope: "places", places: places.includes(place) ? places : [...places, place] };
};

/** Swaps one place for a narrower one in the same position, so the list doesn't jump. */
export const narrowPlace = (draft: ScopeDraft, from: PlaceKey, to: PlaceKey): ScopeDraft => {
  if (draft.scope === "global") return draft;
  const places = draft.places.map((place) => (place === from ? to : place));
  return { scope: "places", places: [...new Set(places)] };
};

const segmentsOf = (place: PlaceKey): ReadonlyArray<string> => {
  const parsed = parsePlaceKey(place);
  return Result.isSuccess(parsed) ? parsed.success.segments : [];
};

/** `apps/checkout` for `…web::apps/checkout` under `…web::`: the part a narrower place adds. */
export const relativePlacePath = (ancestor: PlaceKey, descendant: PlaceKey): string =>
  segmentsOf(descendant).slice(segmentsOf(ancestor).length).join("/");

/** Known places strictly inside `place`, nearest first. */
export const narrowerPlacesOf = (place: PlaceKey, known: ReadonlyArray<PlaceKey>): Array<PlaceKey> =>
  known
    .filter((candidate) => candidate !== place && placeCovers(place, candidate))
    .sort((left, right) => segmentsOf(left).length - segmentsOf(right).length || left.localeCompare(right));

/** The key for a typed subpath under `place`, or why it can't be one. */
export const childPlaceKey = (place: PlaceKey, subpath: string): Result.Result<PlaceKey, string> => {
  const trimmed = subpath.trim().replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return Result.fail("type a path inside this place");
  const parsed = parsePlaceKey(place);
  if (Result.isFailure(parsed)) return Result.fail(parsed.failure);
  const joined =
    parsed.success.form === "repo"
      ? `${parsed.success.repoId}${REPO_PLACE_SEPARATOR}${[...parsed.success.segments, trimmed].join("/")}`
      : `${place.replace(/\/+$/, "")}/${trimmed}`;
  return canonicalPlaceKey(joined);
};

/**
 * What the draft changes, one sentence per change: "Adds billing-api", "Restricts acme/web to
 * apps/checkout", "Applies everywhere, including future places". Empty when nothing changed.
 */
export const describeScopeChange = (
  proposed: DerivationScope,
  draft: ScopeDraft,
  labelOf: (place: PlaceKey) => string = formatPlaceLabel,
): Array<string> => {
  if (isSameScope(proposed, draft)) return [];
  if (draft.scope === "global") return ["Applies everywhere, including future places"];
  if (draft.places.length === 0) return [];
  if (proposed.scope === "global") return [`Limits it to ${draft.places.map(labelOf).join(", ")}`];
  const removed = proposed.places.filter((place) => !draft.places.includes(place));
  const added = draft.places.filter((place) => !proposed.places.includes(place));
  const changes: Array<string> = [];
  const explainedRemovals = new Set<PlaceKey>();
  const explainedAdditions = new Set<PlaceKey>();
  for (const place of added) {
    const wider = removed.find((candidate) => placeCovers(candidate, place));
    if (wider !== undefined) {
      changes.push(`Restricts ${labelOf(wider)} to ${relativePlacePath(wider, place)}`);
      explainedRemovals.add(wider);
      explainedAdditions.add(place);
      continue;
    }
    const narrower = removed.find((candidate) => placeCovers(place, candidate));
    if (narrower !== undefined) {
      changes.push(`Widens ${labelOf(narrower)} to all of ${labelOf(place)}`);
      explainedRemovals.add(narrower);
      explainedAdditions.add(place);
    }
  }
  for (const place of added) if (!explainedAdditions.has(place)) changes.push(`Adds ${labelOf(place)}`);
  for (const place of removed) if (!explainedRemovals.has(place)) changes.push(`Removes ${labelOf(place)}`);
  return changes;
};

/** The decide/preview fields for a draft, or nothing when it matches the proposed scope. */
export const scopeOverrideOf = (
  proposed: DerivationScope,
  draft: ScopeDraft | undefined,
): { scope: "global" } | { scope: "places"; places: Array<PlaceKey> } | undefined => {
  if (draft === undefined || !isCompleteScope(draft) || isSameScope(proposed, draft)) return undefined;
  return draft.scope === "global" ? { scope: "global" } : { scope: "places", places: [...draft.places] };
};
