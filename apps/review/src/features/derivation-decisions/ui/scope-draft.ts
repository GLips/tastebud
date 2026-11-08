/**
 * The scope picker's draft as pure logic: a scope that may be invalid (no places yet), the edits the
 * picker makes to it, and what it says in plain words, alone and against the proposed scope.
 * Removing the last place never means global; global is only ever chosen outright.
 */
import {
  type DerivationScope,
  formatPlaceLabel,
  parsePlaceKey,
  type PlaceKey,
  placeCovers,
  scopeGroupKey,
  scopePlacesOf,
} from "@tastebud/core/places";
import { Result } from "effect";

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

/**
 * Adds a place beside the chosen ones. A place inside or around one already chosen takes its
 * position instead, so adding `acme/web › apps/checkout` beside `acme/web` narrows it in place.
 */
export const withPlace = (draft: ScopeDraft, place: PlaceKey): ScopeDraft => {
  const places = scopePlacesOf(draft);
  const overlaps = (chosen: PlaceKey) => placeCovers(chosen, place) || placeCovers(place, chosen);
  const at = places.findIndex(overlaps);
  if (at === -1) return { scope: "places", places: [...places, place] };
  const kept = places.filter((chosen) => !overlaps(chosen));
  return { scope: "places", places: [...kept.slice(0, at), place, ...kept.slice(at)] };
};

const segmentsOf = (place: PlaceKey): ReadonlyArray<string> => {
  const parsed = parsePlaceKey(place);
  return Result.isSuccess(parsed) ? parsed.success.segments : [];
};

/** `apps/checkout` for `…web::apps/checkout` under `…web::`: the part a narrower place adds. */
export const relativePlacePath = (ancestor: PlaceKey, descendant: PlaceKey): string =>
  segmentsOf(descendant).slice(segmentsOf(ancestor).length).join("/");

/** "a", "a and b", "a, b and c". */
const joinWithAnd = (parts: ReadonlyArray<string>): string =>
  parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

/** The draft as one sentence, for under the picker's rows: "Applies in acme/web › apps/checkout". */
export const describeScopeResult = (
  draft: ScopeDraft,
  labelOf: (place: PlaceKey) => string = formatPlaceLabel,
): string => {
  if (draft.scope === "global") return "Applies everywhere, including places that don't exist yet";
  if (draft.places.length === 0) return "Applies nowhere yet: pick a place, or Everywhere";
  return `Applies in ${joinWithAnd(draft.places.map(labelOf))}`;
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
  // One place swapped for an unrelated one reads as a move, not an add and a remove.
  const onlyAdded = added.find((place) => !explainedAdditions.has(place));
  const onlyRemoved = removed.find((place) => !explainedRemovals.has(place));
  if (
    onlyAdded !== undefined &&
    onlyRemoved !== undefined &&
    added.length - explainedAdditions.size === 1 &&
    removed.length - explainedRemovals.size === 1
  )
    return [...changes, `Moves it from ${labelOf(onlyRemoved)} to ${labelOf(onlyAdded)}`];
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

/** The scope as the end of a button's words: "everywhere", "in acme/web", "in 3 places". */
export const scopeButtonPhrase = (
  scope: DerivationScope,
  labelOf: (place: PlaceKey) => string = formatPlaceLabel,
): string => {
  if (scope.scope === "global") return "everywhere";
  const [only] = scope.places;
  return scope.places.length === 1 && only !== undefined ? `in ${labelOf(only)}` : `in ${scope.places.length} places`;
};
