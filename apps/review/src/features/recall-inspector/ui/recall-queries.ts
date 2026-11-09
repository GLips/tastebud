import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { type RecallExplanationLookup, REVIEW_QUERY_KEYS } from "#review/shared/query-keys.ts";
import { type ReviewContextRequest, unwrapReviewOutcome } from "#review/shared/review-outcome.ts";

import { fetchRecallExplanation } from "../controllers/recall-explain.ts";
import { fetchRecallInspection } from "../controllers/recall-inspection.ts";

export interface RecallInspectionRequest extends ReviewContextRequest {
  readonly query: string;
  readonly kind?: string | undefined;
  readonly history: boolean;
}

/** Wide enough that the inspector can show what the hook's limit cut. */
const INSPECTOR_RECALL_LIMIT = 10;

export const recallInspectionQuery = (request: RecallInspectionRequest) =>
  queryOptions({
    queryKey: REVIEW_QUERY_KEYS.recall(request.query, request.kind, request.history, request.in, request.at),
    queryFn: async () =>
      unwrapReviewOutcome(
        await fetchRecallInspection({
          data: {
            query: request.query,
            limit: INSPECTOR_RECALL_LIMIT,
            ...(request.kind !== undefined && { kind: [request.kind] }),
            ...(request.history && { history: true }),
            ...(request.in !== undefined && { in: request.in }),
            ...(request.at !== undefined && { at: [...request.at] }),
          },
        }),
      ),
    enabled: request.query.trim() !== "",
    placeholderData: keepPreviousData,
  });

/** An item id (or its first 8 characters) typed in the query bar looks the item up instead of matching words. */
export const recallItemRefOf = (query: string): string | undefined =>
  /^[0-9a-f]{8}(-[0-9a-f]{1,12}){0,4}$/i.test(query.trim()) ? query.trim() : undefined;

export interface RecallExplanationRequest extends ReviewContextRequest {
  readonly lookup: RecallExplanationLookup;
  readonly kind?: string | undefined;
  readonly history: boolean;
}

export const recallExplanationQuery = (request: RecallExplanationRequest) =>
  queryOptions({
    queryKey: REVIEW_QUERY_KEYS.recallExplanation(
      request.lookup,
      request.kind,
      request.history,
      request.in,
      request.at,
    ),
    queryFn: async () =>
      unwrapReviewOutcome(
        await fetchRecallExplanation({
          data: {
            ...request.lookup,
            ...(request.kind !== undefined && { kind: [request.kind] }),
            ...(request.history && { history: true }),
            ...(request.in !== undefined && { in: request.in }),
            ...(request.at !== undefined && { at: [...request.at] }),
          },
        }),
      ),
  });
