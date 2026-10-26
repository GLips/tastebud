/** Store-wide facts most screens need: the catalog, and labels for every place in use. */
import { useQuery } from "@tanstack/react-query";
import type { CatalogView } from "@taste/core/catalog-view";
import type { PlaceKey } from "@taste/core/places";
import { useMemo } from "react";

import { labelPlaces } from "./place-chips.tsx";
import { knownPlacesQuery, reviewShellQuery } from "./review-queries.ts";

export const useReviewCatalog = (): CatalogView | undefined => useQuery(reviewShellQuery).data?.catalog;

export interface KnownPlaces {
  readonly places: ReadonlyArray<PlaceKey>;
  readonly labels: ReadonlyMap<PlaceKey, string>;
  /** A label for any key, known or not, with the host added only when two repos collide. */
  readonly labelOf: (place: PlaceKey) => string;
}

export const useKnownPlaces = (extra: ReadonlyArray<PlaceKey> = []): KnownPlaces => {
  const known = useQuery(knownPlacesQuery).data;
  const extraKey = extra.join("\n");
  return useMemo(() => {
    const places = [...new Set([...(known ?? []).map((entry) => entry.place), ...extraKey.split("\n")])].filter(
      (place) => place !== "",
    );
    const labels = labelPlaces(places);
    return { places, labels, labelOf: (place) => labels.get(place) ?? labelPlaces([place]).get(place) ?? place };
  }, [known, extraKey]);
};
