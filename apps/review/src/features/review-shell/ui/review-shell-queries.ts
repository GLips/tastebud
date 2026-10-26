/** The reads nearly every screen shares: the shell header, known places, a resolved context, one record. */
import { queryOptions } from "@tanstack/react-query";

import { REVIEW_POLL_MS, REVIEW_QUERY_KEYS } from "#review/shared/query-keys.ts";
import { type ReviewContextRequest, unwrapReviewOutcome } from "#review/shared/review-outcome.ts";

import { fetchRecordDetail } from "../controllers/record-detail.ts";
import { resolveReviewContext } from "../controllers/review-context.ts";
import { fetchKnownPlaces, fetchReviewShell } from "../controllers/review-shell.ts";

export const reviewShellQuery = queryOptions({
  queryKey: REVIEW_QUERY_KEYS.shell(),
  queryFn: async () => unwrapReviewOutcome(await fetchReviewShell()),
  refetchInterval: REVIEW_POLL_MS,
});

/** Every place named by any scope, for autocomplete and label disambiguation. Changes rarely. */
export const knownPlacesQuery = queryOptions({
  queryKey: REVIEW_QUERY_KEYS.knownPlaces(),
  queryFn: async () => unwrapReviewOutcome(await fetchKnownPlaces()),
  refetchInterval: 5_000,
});

export const recordDetailQuery = (ref: string) =>
  queryOptions({
    queryKey: REVIEW_QUERY_KEYS.record(ref),
    queryFn: async () => unwrapReviewOutcome(await fetchRecordDetail({ data: { ref } })),
    refetchInterval: REVIEW_POLL_MS,
  });

export const reviewContextQuery = (request: ReviewContextRequest) =>
  queryOptions({
    queryKey: REVIEW_QUERY_KEYS.reviewContext(request.in, request.at),
    queryFn: async () =>
      unwrapReviewOutcome(
        await resolveReviewContext({
          data: {
            ...(request.in !== undefined && { in: request.in }),
            ...(request.at !== undefined && { at: [...request.at] }),
          },
        }),
      ),
    enabled: request.in !== undefined || (request.at?.length ?? 0) > 0,
  });
