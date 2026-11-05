import { parsePlaceKey, type PlaceKey, placeCovers, REPO_PLACE_SEPARATOR } from "@tastebud/core/places";
/**
 * The Places page's tree, as pure data: repo places grouped under their repo (subpaths nested by
 * containment), then directory and named places nested the same way. A repo appears even when only
 * its subpaths are in use, as a container with no place of its own.
 */
import type { AuditPlacesResult } from "@tastebud/core/places-audit";
import { Result } from "effect";

export interface PlaceTreeNode {
  /** Present when this node is a place in use; a bare repo container has none. */
  readonly place?: PlaceKey;
  readonly label: string;
  readonly children: ReadonlyArray<PlaceTreeNode>;
}

export interface PlaceTreeSections {
  readonly repos: ReadonlyArray<PlaceTreeNode>;
  readonly directories: ReadonlyArray<PlaceTreeNode>;
  readonly named: ReadonlyArray<PlaceTreeNode>;
}

/** Nests `places` by containment; each child is labelled by the path it adds to its parent. */
const nestPlaces = (
  places: ReadonlyArray<PlaceKey>,
  labelOf: (place: PlaceKey, parent: PlaceKey | undefined) => string,
): Array<PlaceTreeNode> => {
  const parentOf = (place: PlaceKey) =>
    places
      .filter((candidate) => candidate !== place && placeCovers(candidate, place))
      .sort((left, right) => right.length - left.length)[0];
  const build = (parent: PlaceKey | undefined): Array<PlaceTreeNode> =>
    places
      .filter((place) => parentOf(place) === parent)
      .sort((left, right) => left.localeCompare(right))
      .map((place) => ({ place, label: labelOf(place, parent), children: build(place) }));
  return build(undefined);
};

const segmentsAfter = (place: PlaceKey, parent: PlaceKey | undefined): string => {
  const own = parsePlaceKey(place);
  const ancestor = parent === undefined ? undefined : parsePlaceKey(parent);
  if (Result.isFailure(own)) return place;
  const skip = ancestor !== undefined && Result.isSuccess(ancestor) ? ancestor.success.segments.length : 0;
  return own.success.segments.slice(skip).join("/");
};

export const buildPlaceTree = (
  places: ReadonlyArray<PlaceKey>,
  repoLabelOf: (rootPlace: PlaceKey) => string,
): PlaceTreeSections => {
  const byRepo = new Map<string, Array<PlaceKey>>();
  const directories: Array<PlaceKey> = [];
  const named: Array<PlaceKey> = [];
  for (const place of places) {
    const parsed = parsePlaceKey(place);
    if (Result.isFailure(parsed)) continue;
    if (parsed.success.form === "repo")
      byRepo.set(parsed.success.repoId, [...(byRepo.get(parsed.success.repoId) ?? []), place]);
    else if (parsed.success.form === "directory") directories.push(place);
    else named.push(place);
  }
  const repos = [...byRepo.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([repoId, repoPlaces]): PlaceTreeNode => {
      const root = `${repoId}${REPO_PLACE_SEPARATOR}`;
      const nested = nestPlaces(
        repoPlaces.filter((place) => place !== root),
        (place, parent) => segmentsAfter(place, parent ?? root),
      );
      const label = repoLabelOf(root);
      return repoPlaces.includes(root) ? { place: root, label, children: nested } : { label, children: nested };
    });
  return {
    repos,
    directories: nestPlaces(directories, (place, parent) =>
      parent === undefined ? place : segmentsAfter(place, parent),
    ),
    named: nestPlaces(named, (place, parent) => (parent === undefined ? place : segmentsAfter(place, parent))),
  };
};

/** Nodes (and their ancestors) whose label or key contains `needle`. */
export const filterPlaceTree = (nodes: ReadonlyArray<PlaceTreeNode>, needle: string): Array<PlaceTreeNode> => {
  const lower = needle.trim().toLowerCase();
  if (lower === "") return [...nodes];
  return nodes.flatMap((node) => {
    const children = filterPlaceTree(node.children, needle);
    const own = node.label.toLowerCase().includes(lower) || (node.place?.toLowerCase().includes(lower) ?? false);
    return own || children.length > 0 ? [{ ...node, children: own ? node.children : children }] : [];
  });
};

/** The top place in tree order, so the details pane opens on the row the reviewer sees first. */
export const firstPlaceShown = (nodes: ReadonlyArray<PlaceTreeNode>): string | undefined => {
  for (const node of nodes) {
    const found = node.place ?? firstPlaceShown(node.children);
    if (found !== undefined) return found;
  }
  return undefined;
};

/** Everything scoped to one place, across kinds and statuses. */
export const totalPlaceCount = (counts: AuditPlacesResult["globalCounts"]): number =>
  counts.reduce((sum, entry) => sum + entry.count, 0);
