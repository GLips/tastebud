import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { DerivationScope } from "@taste/core/places";

import { REVIEW_POLL_MS, REVIEW_QUERY_KEYS } from "#review/shared/query-keys.ts";
import { unwrapReviewOutcome } from "#review/shared/review-outcome.ts";

import { fetchAcceptPreview } from "../controllers/accept-preview.ts";
import { fetchInboxGroups } from "../controllers/inbox.ts";

export const inboxGroupsQuery = queryOptions({
  queryKey: REVIEW_QUERY_KEYS.inbox(),
  queryFn: async () => unwrapReviewOutcome(await fetchInboxGroups()),
  refetchInterval: REVIEW_POLL_MS,
});

export const acceptPreviewQuery = (ref: string, scope: DerivationScope | undefined) =>
  queryOptions({
    queryKey: REVIEW_QUERY_KEYS.acceptPreview(ref, scope),
    queryFn: async () =>
      unwrapReviewOutcome(
        await fetchAcceptPreview({
          data: {
            ref,
            ...(scope !== undefined && { scope: scope.scope }),
            ...(scope?.scope === "places" && { places: [...scope.places] }),
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
