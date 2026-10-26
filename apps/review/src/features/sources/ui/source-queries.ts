import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { REVIEW_POLL_MS, REVIEW_QUERY_KEYS } from "#review/shared/query-keys.ts";
import { unwrapReviewOutcome } from "#review/shared/review-outcome.ts";

import { fetchSourceList } from "../controllers/source-list.ts";

export const sourceListQuery = (kind: string | undefined) =>
  queryOptions({
    queryKey: REVIEW_QUERY_KEYS.sources(kind),
    queryFn: async () =>
      unwrapReviewOutcome(await fetchSourceList({ data: kind === undefined ? {} : { kind: [kind] } })),
    refetchInterval: REVIEW_POLL_MS * 3,
    placeholderData: keepPreviousData,
  });
