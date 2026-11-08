/**
 * What applies where the inspector stands, prompt aside: the same scope rule recall uses
 * (`matchScopeToContext`), over every derivation of a kind agents can be told.
 */
import type { CatalogView, DerivedKindView } from "@tastebud/core/kind-catalog";
import { matchScopeToContext } from "@tastebud/core/places";
import type { DerivationSummary } from "@tastebud/core/record-views";

export interface RecallAppliesKindGroup {
  readonly kind: DerivedKindView;
  readonly accepted: ReadonlyArray<DerivationSummary>;
}

export interface RecallAppliesHere {
  readonly byKind: ReadonlyArray<RecallAppliesKindGroup>;
  /** Rejections in scope here: recall reads them back so agents don't propose them again. */
  readonly rejected: ReadonlyArray<DerivationSummary>;
}

export const recallAppliesHereOf = (
  rows: ReadonlyArray<DerivationSummary>,
  places: ReadonlyArray<string>,
  catalog: CatalogView | undefined,
  onlyKind: string | undefined,
): RecallAppliesHere => {
  const kinds = (catalog?.derivedKinds ?? []).filter(
    (kind) => kind.recall !== "never" && (onlyKind === undefined || kind.key === onlyKind),
  );
  const inScope = rows.filter(
    (row) =>
      kinds.some((kind) => kind.key === row.kind) && matchScopeToContext(row.effectiveScope, places) !== undefined,
  );
  return {
    byKind: kinds
      .map((kind) => ({
        kind,
        accepted: inScope.filter((row) => row.kind === kind.key && row.status === "accepted"),
      }))
      .filter((group) => group.accepted.length > 0),
    rejected: inScope.filter((row) => row.status === "rejected"),
  };
};
