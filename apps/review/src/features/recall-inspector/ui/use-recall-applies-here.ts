import { useQuery } from "@tanstack/react-query";

import { derivationListQuery } from "#review/features/derivation-library/index.ts";
import { reviewContextQuery, useReviewCatalog } from "#review/features/review-shell/index.ts";

import { recallAppliesHereOf } from "./recall-applies.ts";

/** Where the inspector stands (resolved without a prompt) and everything that applies there. */
export function useRecallAppliesHere(request: {
  readonly in: string | undefined;
  readonly at: ReadonlyArray<string> | undefined;
  readonly kind: string | undefined;
}) {
  const catalog = useReviewCatalog();
  const nowhere = request.in === undefined && request.at === undefined;
  const standing = useQuery(reviewContextQuery({ in: request.in, at: request.at }));
  const derivations = useQuery(derivationListQuery({}));
  const places = nowhere ? [] : (standing.data?.places ?? []);
  return {
    nowhere,
    standing: nowhere ? undefined : standing.data,
    applies: recallAppliesHereOf(derivations.data ?? [], places, catalog, request.kind),
  };
}
