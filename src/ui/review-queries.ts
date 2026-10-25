/** Every query the screens share, keyed so a decision can invalidate exactly what it changed. */
import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import {
  fetchAcceptPreview,
  fetchDerivationList,
  fetchInboxGroups,
  fetchPlacesAudit,
  fetchRecallInspection,
  fetchRecordDetail,
  fetchReviewShell,
  fetchSourceList,
  resolveReviewContext,
} from "../server/review-functions.ts";
import { type ReviewContextRequest, unwrapReviewOutcome } from "../server/review-outcome.ts";
import type { DerivationScope } from "../shared/places.ts";
import type { DerivationStatus } from "../shared/vocabulary.ts";

/** Agents write to the store from other processes and there is no push, so screens re-read this often. */
const REVIEW_POLL_MS = 1_000;

export const reviewShellQuery = queryOptions({
  queryKey: ["shell"],
  queryFn: async () => unwrapReviewOutcome(await fetchReviewShell()),
  refetchInterval: REVIEW_POLL_MS,
});

export const inboxGroupsQuery = queryOptions({
  queryKey: ["inbox"],
  queryFn: async () => unwrapReviewOutcome(await fetchInboxGroups()),
  refetchInterval: REVIEW_POLL_MS,
});

/** Every place named by any scope, for autocomplete and label disambiguation. Changes rarely. */
export const knownPlacesQuery = queryOptions({
  queryKey: ["places", "known"],
  queryFn: async () => {
    const audit = unwrapReviewOutcome(await fetchPlacesAudit({ data: {} }));
    return audit.places;
  },
  refetchInterval: 5_000,
});

export const acceptPreviewQuery = (target: string, scope: DerivationScope | undefined) =>
  queryOptions({
    queryKey: ["accept-preview", target, scope ?? null],
    queryFn: async () =>
      unwrapReviewOutcome(
        await fetchAcceptPreview({
          data: {
            target,
            ...(scope !== undefined && { scope: scope.scope }),
            ...(scope?.scope === "places" && { places: [...scope.places] }),
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });

export interface DerivationListFilter {
  readonly kind?: string | undefined;
  readonly status?: DerivationStatus | undefined;
  readonly place?: string | undefined;
  readonly text?: string | undefined;
}

export const derivationListQuery = (filter: DerivationListFilter) =>
  queryOptions({
    queryKey: ["derivations", filter.kind ?? null, filter.status ?? null, filter.place ?? null, filter.text ?? null],
    queryFn: async () =>
      unwrapReviewOutcome(
        await fetchDerivationList({
          data: {
            ...(filter.kind !== undefined && { kind: [filter.kind] }),
            ...(filter.status !== undefined && { status: filter.status }),
            ...(filter.place !== undefined && { place: filter.place }),
            ...(filter.text !== undefined && { text: filter.text }),
          },
        }),
      ).derivations,
    refetchInterval: REVIEW_POLL_MS,
    // A filter change keeps the old rows up until the new ones land, instead of flashing a loader.
    placeholderData: keepPreviousData,
  });

export const recordDetailQuery = (ref: string) =>
  queryOptions({
    queryKey: ["record", ref],
    queryFn: async () => unwrapReviewOutcome(await fetchRecordDetail({ data: { ref } })),
    refetchInterval: REVIEW_POLL_MS,
  });

export const sourceListQuery = (kind: string | undefined) =>
  queryOptions({
    queryKey: ["sources", kind ?? null],
    queryFn: async () =>
      unwrapReviewOutcome(await fetchSourceList({ data: kind === undefined ? {} : { kind: [kind] } })),
    refetchInterval: REVIEW_POLL_MS * 3,
    placeholderData: keepPreviousData,
  });

export interface RecallInspectionRequest extends ReviewContextRequest {
  readonly query: string;
  readonly kind?: string | undefined;
  readonly history: boolean;
}

/** Wide enough that the inspector can show what the hook's limit cut. */
const INSPECTOR_RECALL_LIMIT = 10;

export const recallInspectionQuery = (request: RecallInspectionRequest) =>
  queryOptions({
    queryKey: ["recall", request.query, request.kind ?? null, request.history, request.dir ?? null, request.at ?? null],
    queryFn: async () =>
      unwrapReviewOutcome(
        await fetchRecallInspection({
          data: {
            query: request.query,
            limit: INSPECTOR_RECALL_LIMIT,
            ...(request.kind !== undefined && { kind: [request.kind] }),
            ...(request.history && { history: true }),
            ...(request.dir !== undefined && { dir: request.dir }),
            ...(request.at !== undefined && { at: [...request.at] }),
          },
        }),
      ),
    enabled: request.query.trim() !== "",
    placeholderData: keepPreviousData,
  });

export const placesAuditQuery = (probes: ReadonlyArray<string>) =>
  queryOptions({
    queryKey: ["places", "audit", probes],
    queryFn: async () =>
      unwrapReviewOutcome(
        await fetchPlacesAudit({
          data: {
            ...(probes.some((probe) => looksLikeDirectory(probe)) && {
              probes: probes.filter((probe) => looksLikeDirectory(probe)),
            }),
            ...(probes.some((probe) => !looksLikeDirectory(probe)) && {
              probePlaces: probes.filter((probe) => !looksLikeDirectory(probe)),
            }),
          },
        }),
      ),
    refetchInterval: REVIEW_POLL_MS * 3,
    placeholderData: keepPreviousData,
  });

/**
 * A probe is a directory when it reads like a filesystem path; anything else is a place key. A
 * `~/…` or `/…` place key and a directory are the same spelling, so the resolver decides those.
 */
const looksLikeDirectory = (probe: string): boolean => probe.startsWith("/") || probe.startsWith("~");

export const reviewContextQuery = (request: ReviewContextRequest) =>
  queryOptions({
    queryKey: ["context", request.dir ?? null, request.at ?? null],
    queryFn: async () =>
      unwrapReviewOutcome(
        await resolveReviewContext({
          data: {
            ...(request.dir !== undefined && { dir: request.dir }),
            ...(request.at !== undefined && { at: [...request.at] }),
          },
        }),
      ),
    enabled: request.dir !== undefined || (request.at?.length ?? 0) > 0,
  });
