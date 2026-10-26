import { derivationStateOf } from "#core/domains/record-snapshot/index.ts";
import type { ViewSource } from "#core/domains/record-views/index.ts";

/** Pending derivations per live kind, every kind present (zero included). What the review header counts. */
export const countPendingByKind = (view: ViewSource): Record<string, number> => {
  const counts: Record<string, number> = Object.fromEntries(view.catalog.derivedKinds.map((kind) => [kind.key, 0]));
  for (const derivation of view.snapshot.derivations) {
    const count = counts[derivation.kind];
    if (count !== undefined && derivationStateOf(view.snapshot, derivation).status === "pending")
      counts[derivation.kind] = count + 1;
  }
  return counts;
};
