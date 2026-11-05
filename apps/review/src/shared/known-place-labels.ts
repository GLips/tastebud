/** Short, unambiguous labels for place keys, and the Places page's name for the global scope. */
import { formatPlaceLabel, parsePlaceKey, type PlaceKey } from "@tastebud/core/places";
import { Result } from "effect";

/** The `place` search value that selects the global scope on the Places page; not a place key. */
export const GLOBAL_PLACE_NODE = "(global)";

const repoHostOf = (place: PlaceKey): string | undefined => {
  const parsed = parsePlaceKey(place);
  return Result.isSuccess(parsed) && parsed.success.form === "repo" ? parsed.success.repoId.split("/")[0] : undefined;
};

/**
 * Short labels for a set of places, adding the host only where two repos would otherwise read the
 * same (`github.com/acme/web` beside `gitlab.com/acme/web`).
 */
export const labelPlaces = (places: ReadonlyArray<PlaceKey>): Map<PlaceKey, string> => {
  const byLabel = new Map<string, Set<string>>();
  for (const place of places) {
    const label = formatPlaceLabel(place);
    const hosts = byLabel.get(label) ?? new Set<string>();
    hosts.add(repoHostOf(place) ?? "");
    byLabel.set(label, hosts);
  }
  return new Map(
    places.map((place) => {
      const label = formatPlaceLabel(place);
      const host = repoHostOf(place);
      const ambiguous = (byLabel.get(label)?.size ?? 0) > 1;
      return [place, ambiguous && host !== undefined ? `${host}/${label}` : label];
    }),
  );
};
