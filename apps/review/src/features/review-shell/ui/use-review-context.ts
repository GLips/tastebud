/** Store-wide facts most screens need: the catalog, and labels for every place in use. */
import { useQuery } from "@tanstack/react-query";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { PlaceKey } from "@tastebud/core/places";
import { useMemo } from "react";

import { labelPlaces } from "#review/shared/known-place-labels.ts";
import { type KnownPlaces } from "#review/shared/known-places.ts";

import { knownPlacesQuery, reviewShellQuery } from "./review-shell-queries.ts";

export const useReviewCatalog = (): CatalogView | undefined => useQuery(reviewShellQuery).data?.catalog;

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
