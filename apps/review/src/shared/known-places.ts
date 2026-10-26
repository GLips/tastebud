import type { PlaceKey } from "@taste/core/places";

/** Every place in use with its short label; named here so shared/ui and every feature can take it as a prop. */
export interface KnownPlaces {
  readonly places: ReadonlyArray<PlaceKey>;
  readonly labels: ReadonlyMap<PlaceKey, string>;
  /** A label for any key, known or not, with the host added only when two repos collide. */
  readonly labelOf: (place: PlaceKey) => string;
}
