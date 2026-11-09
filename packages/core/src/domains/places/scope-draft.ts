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
 * The chosen places that `place` is inside or around. A place that overlaps one already chosen
 * can't go beside it: it would only repeat or swallow it.
 */
export const scopePlacesOverlapping = (draft: ScopeDraft, place: PlaceKey): Array<PlaceKey> =>
  scopePlacesOf(draft).filter((chosen) => placeCovers(chosen, place) || placeCovers(place, chosen));

/**
 * One edit in the scope picker, a property menu: `use` makes a place the whole scope (narrow, widen
 * or move in one step), `add` puts one beside the others, `remove` drops one of several.
 */
export type ScopePick =
  | { readonly pick: "everywhere" }
  | { readonly pick: "use"; readonly place: PlaceKey }
  | ScopeSideAction;

/** The edits a row's side button makes, "+ Also" or ✕, which keep the menu open. */
export interface ScopeSideAction {
  readonly pick: "add" | "remove";
  readonly place: PlaceKey;
}

export const applyScopePick = (draft: ScopeDraft, pick: ScopePick): ScopeDraft => {
  switch (pick.pick) {
    case "everywhere":
      return { scope: "global" };
    case "use":
      return { scope: "places", places: [pick.place] };
    case "add":
      return { scope: "places", places: [...scopePlacesOf(draft), pick.place] };
    case "remove":
      return { scope: "places", places: scopePlacesOf(draft).filter((kept) => kept !== pick.place) };
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
    ...repoRoots.flatMap((root) => asKey(`${root}${path}`, "as a folder").filter((choice) => choice.place !== root)),
    ...(looksLikeRepoId(path) ? asKey(`${path}${REPO_PLACE_SEPARATOR}`, "as a repo") : []),
  ];
  const namedFirst = namedPlaces.some((place) => firstSegment(place) === firstSegment(path));
  return namedFirst ? [...named, ...others] : [...others, ...named];
};

/** "a", "a and b", "a, b and c". */
const joinWithAnd = (parts: ReadonlyArray<string>): string =>
  parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

/** The draft as what agents get: "Agents working in acme/web › apps/checkout will be told this". */
export const describeScopeForAgents = (
  draft: ScopeDraft,
  labelOf: (place: PlaceKey) => string = formatPlaceLabel,
): string => {
  if (draft.scope === "global") return "Agents working anywhere will be told this";
  if (draft.places.length === 0) return "No agent will be told this until it has a place";
  return `Agents working in ${joinWithAnd(draft.places.map(labelOf))} will be told this`;
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
