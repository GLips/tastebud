/**
 * A scope while the owner is changing it, before any decision: a draft that may have no places yet,
 * the picks that edit it, what typed text could mean as a place, and the draft in plain words,
 * alone and against the proposed scope. Removing the last place never means global; global is only
 * ever picked outright.
 */
import { Result } from "effect";

import {
  canonicalPlaceKey,
  formatPlaceLabel,
  parsePlaceKey,
  type PlaceKey,
  placeCovers,
  REPO_PLACE_SEPARATOR,
} from "./place-keys.ts";
import { type DerivationScope, scopeGroupKey, scopePlacesOf } from "./scope-match.ts";

export type ScopeDraft =
  | { readonly scope: "global" }
  | { readonly scope: "places"; readonly places: ReadonlyArray<PlaceKey> };

export const isCompleteScope = (draft: ScopeDraft): draft is DerivationScope =>
  draft.scope === "global" || draft.places.length > 0;

const scopeDraftKey = (draft: ScopeDraft): string => (isCompleteScope(draft) ? scopeGroupKey(draft) : "(no places)");

export const isSameScope = (left: ScopeDraft, right: ScopeDraft): boolean =>
  scopeDraftKey(left) === scopeDraftKey(right);

/**
 * Adds a place beside the chosen ones. A place inside or around one already chosen takes its
 * position instead, so adding `acme/web › apps/checkout` beside `acme/web` narrows it in place.
 */
const withPlace = (draft: ScopeDraft, place: PlaceKey): ScopeDraft => {
  const places = scopePlacesOf(draft);
  const overlaps = (chosen: PlaceKey) => placeCovers(chosen, place) || placeCovers(place, chosen);
  const at = places.findIndex(overlaps);
  if (at === -1) return { scope: "places", places: [...places, place] };
  const kept = places.filter((chosen) => !overlaps(chosen));
  return { scope: "places", places: [...kept.slice(0, at), place, ...kept.slice(at)] };
};

/**
 * One edit in the scope picker. `only` makes a place the whole scope (narrow, widen or move in one
 * step); `add` puts one beside the others; `earlier` returns to the places Everywhere replaced.
 */
export type ScopePick =
  | { readonly pick: "everywhere" }
  | { readonly pick: "earlier" }
  | { readonly pick: "only" | "add" | "remove"; readonly place: PlaceKey };

/** The draft plus the places Everywhere last replaced, so Everywhere and back loses nothing. */
export interface ScopePickState {
  readonly draft: ScopeDraft;
  readonly earlier: ReadonlyArray<PlaceKey>;
}

export const applyScopePick = (state: ScopePickState, pick: ScopePick): ScopePickState => {
  const { draft, earlier } = state;
  switch (pick.pick) {
    case "everywhere":
      return {
        draft: { scope: "global" },
        earlier: draft.scope === "places" && draft.places.length > 0 ? draft.places : earlier,
      };
    case "earlier":
      return { draft: earlier.length > 0 ? { scope: "places", places: earlier } : draft, earlier };
    case "only":
      return { draft: { scope: "places", places: [pick.place] }, earlier };
    case "add":
      return { draft: withPlace(draft, pick.place), earlier };
    case "remove":
      return {
        draft:
          draft.scope === "global"
            ? draft
            : { scope: "places", places: draft.places.filter((kept) => kept !== pick.place) },
        earlier,
      };
  }
};

const segmentsOf = (place: PlaceKey): ReadonlyArray<string> => {
  const parsed = parsePlaceKey(place);
  return Result.isSuccess(parsed) ? parsed.success.segments : [];
};

/** `apps/checkout` for `…web::apps/checkout` under `…web::`: the part a narrower place adds. */
export const relativePlacePath = (ancestor: PlaceKey, descendant: PlaceKey): string =>
  segmentsOf(descendant).slice(segmentsOf(ancestor).length).join("/");

const firstSegment = (place: string) => place.split("/")[0];

const looksLikeRepoId = (text: string) => /^[\w-]+(\.[\w-]+)+\/[^/]+\/[^/]+/.test(text);

/**
 * What typed text could mean as a place. A full key (`…::`, `~/…`, `/…`) means itself. A bare path
 * is offered as a folder in each given repo, as a repo when it reads like `github.com/owner/repo`,
 * and as a named place: first when a known named place starts the same way (`clients/globex`
 * beside `clients/acme`), else last.
 */
export const typedPlaceChoicesOf = (
  text: string,
  {
    repoRoots,
    namedPlaces,
    labelOf = formatPlaceLabel,
  }: {
    repoRoots: ReadonlyArray<PlaceKey>;
    namedPlaces: ReadonlyArray<PlaceKey>;
    labelOf?: (place: PlaceKey) => string;
  },
): Array<{ place: PlaceKey; label: string; meaning: string }> => {
  const trimmed = text.trim().replace(/\/+$/, "");
  if (trimmed === "") return [];
  const asKey = (key: string, meaning: string) => {
    const canonical = canonicalPlaceKey(key);
    return Result.isSuccess(canonical)
      ? [{ place: canonical.success, label: labelOf(canonical.success), meaning }]
      : [];
  };
  if (trimmed.includes(REPO_PLACE_SEPARATOR)) return asKey(trimmed, "as a repo place");
  if (trimmed.startsWith("~") || trimmed.startsWith("/")) return asKey(trimmed, "as a folder on this machine");
  const path = trimmed.replace(/^\/+/, "");
  const named = asKey(path, "as a named place");
  const others = [
    ...repoRoots.flatMap((root) =>
      asKey(`${root}${path}`, `in ${labelOf(root)}`).filter((choice) => choice.place !== root),
    ),
    ...(looksLikeRepoId(path) ? asKey(`${path}${REPO_PLACE_SEPARATOR}`, "as a repo") : []),
  ];
  const namedFirst = namedPlaces.some((place) => firstSegment(place) === firstSegment(path));
  return namedFirst ? [...named, ...others] : [...others, ...named];
};

/** "a", "a and b", "a, b and c". */
const joinWithAnd = (parts: ReadonlyArray<string>): string =>
  parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

/** The draft as one sentence: "Applies in acme/web › apps/checkout". */
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
 * apps/checkout", "Moves it from acme/web to acme/billing-api". Empty when nothing changed.
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
