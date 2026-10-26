import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { REVIEW_POLL_MS, REVIEW_QUERY_KEYS } from "#review/shared/query-keys.ts";
import { unwrapReviewOutcome } from "#review/shared/review-outcome.ts";

import { fetchPlacesAudit } from "../controllers/places-audit.ts";
import { fetchRepointPreview } from "../controllers/repoint-preview.ts";

export const repointPreviewQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: REVIEW_QUERY_KEYS.repointPreview(from, to),
    queryFn: async () => unwrapReviewOutcome(await fetchRepointPreview({ data: { from, to } })),
    placeholderData: keepPreviousData,
  });

export const placesAuditQuery = (probes: ReadonlyArray<string>) =>
  queryOptions({
    queryKey: REVIEW_QUERY_KEYS.placesAudit(probes),
    queryFn: async () =>
      unwrapReviewOutcome(
        await fetchPlacesAudit({
          data: {
            ...(probes.some((probe) => looksLikeDirectory(probe)) && {
              probes: probes.filter((probe) => looksLikeDirectory(probe)),
            }),
            ...(probes.some((probe) => !looksLikeDirectory(probe)) && {
              probe_places: probes.filter((probe) => !looksLikeDirectory(probe)),
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
