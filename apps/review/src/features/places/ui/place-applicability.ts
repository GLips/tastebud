/**
 * What reaches one place, and from where: scoped to it exactly, inherited from a place that covers it
 * (a repo covers its subfolders), or global. Items scoped to a subfolder never reach the parent.
 */
import { placeCovers } from "@tastebud/core/places";
import type { DerivationSummary } from "@tastebud/core/record-views";

import { GLOBAL_PLACE_NODE } from "#review/shared/known-place-labels.ts";

export type PlaceReachOrigin =
  | { readonly from: "here" }
  | { readonly from: "parent"; readonly place: string }
  | { readonly from: "everywhere" };

export interface PlaceReachRow {
  readonly summary: DerivationSummary;
  readonly origin: PlaceReachOrigin;
}

/** The detail's tabs, one per `PlaceReach` list; `settled` is "Doesn't apply". Kept in the URL. */
export const PLACE_REACH_TABS = ["applies", "waiting", "settled"] as const;
export type PlaceReachTab = (typeof PLACE_REACH_TABS)[number];

export interface PlaceReach {
  /** Accepted: what agents are told here. */
  readonly applies: ReadonlyArray<PlaceReachRow>;
  /** Pending: would apply here if accepted as proposed. */
  readonly waiting: ReadonlyArray<PlaceReachRow>;
  /** Rejected, retracted or replaced: reach this place but don't apply. */
  readonly settledAgainst: ReadonlyArray<PlaceReachRow>;
}

const originOf = (row: DerivationSummary, place: string): PlaceReachOrigin | undefined => {
  const scope = row.effectiveScope;
  if (scope.scope === "global") return { from: "everywhere" };
  if (place === GLOBAL_PLACE_NODE) return undefined;
  if (scope.places.includes(place)) return { from: "here" };
  const parent = scope.places.find((candidate) => placeCovers(candidate, place));
  return parent === undefined ? undefined : { from: "parent", place: parent };
};

const ORIGIN_ORDER: Record<PlaceReachOrigin["from"], number> = { here: 0, parent: 1, everywhere: 2 };

export const placeReachOf = (place: string, rows: ReadonlyArray<DerivationSummary>): PlaceReach => {
  const reached = rows
    .flatMap((summary) => {
      const origin = originOf(summary, place);
      return origin === undefined ? [] : [{ summary, origin }];
    })
    .toSorted((left, right) => ORIGIN_ORDER[left.origin.from] - ORIGIN_ORDER[right.origin.from]);
  return {
    applies: reached.filter((row) => row.summary.status === "accepted"),
    waiting: reached.filter((row) => row.summary.status === "pending"),
    settledAgainst: reached.filter((row) => row.summary.status !== "accepted" && row.summary.status !== "pending"),
  };
};
