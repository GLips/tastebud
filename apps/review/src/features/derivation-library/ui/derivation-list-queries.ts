import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { REVIEW_POLL_MS, REVIEW_QUERY_KEYS } from "#review/shared/query-keys.ts";
import { unwrapReviewOutcome } from "#review/shared/review-outcome.ts";

import { fetchDerivationList } from "../controllers/derivation-list.ts";

export interface DerivationListFilter {
  readonly kind?: string | undefined;
  readonly place?: string | undefined;
  readonly text?: string | undefined;
}

export const derivationListQuery = (filter: DerivationListFilter) =>
  queryOptions({
    queryKey: REVIEW_QUERY_KEYS.derivationList(filter.kind, filter.place, filter.text),
    queryFn: async () =>
      unwrapReviewOutcome(
        await fetchDerivationList({
          data: {
            ...(filter.kind !== undefined && { kind: [filter.kind] }),
            ...(filter.place !== undefined && { place: filter.place }),
            ...(filter.text !== undefined && { text: filter.text }),
          },
        }),
      ).derivations,
    refetchInterval: REVIEW_POLL_MS,
    // A filter change keeps the old rows up until the new ones land, instead of flashing a loader.
    placeholderData: keepPreviousData,
  });
