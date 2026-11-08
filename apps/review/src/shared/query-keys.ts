/**
 * Every query key the screens use, in one place so a write can invalidate exactly what it changed. The
 * first element is the family a refresh targets; the rest narrow it.
 */
import type { DerivationScope } from "@tastebud/core/places";
import type { DerivationStatus } from "@tastebud/core/taste-vocabulary";

/** What Recall's explanation looks up: a derivation by ref, or by words from its statement. */
export type RecallExplanationLookup = { readonly ref: string } | { readonly text: string };

export const REVIEW_QUERY_KEYS = {
  shell: () => ["shell"] as const,
  inbox: () => ["inbox"] as const,
  knownPlaces: () => ["places", "known"] as const,
  placesAudit: (probes: ReadonlyArray<string>) => ["places", "audit", probes] as const,
  acceptPreviews: () => ["accept-preview"] as const,
  acceptPreviewsOf: (ref: string) => ["accept-preview", ref] as const,
  acceptPreview: (ref: string, scope: DerivationScope | undefined) => ["accept-preview", ref, scope ?? null] as const,
  derivationList: (
    kind: string | undefined,
    status: DerivationStatus | undefined,
    place: string | undefined,
    text: string | undefined,
  ) => ["derivations", kind ?? null, status ?? null, place ?? null, text ?? null] as const,
  records: () => ["record"] as const,
  record: (ref: string) => ["record", ref] as const,
  sources: (kind: string | undefined, text: string | undefined) => ["sources", kind ?? null, text ?? null] as const,
  recall: (
    query: string,
    kind: string | undefined,
    history: boolean,
    directory: string | undefined,
    at: ReadonlyArray<string> | undefined,
  ) => ["recall", query, kind ?? null, history, directory ?? null, at ?? null] as const,
  recallExplanation: (
    lookup: RecallExplanationLookup,
    kind: string | undefined,
    history: boolean,
    directory: string | undefined,
    at: ReadonlyArray<string> | undefined,
  ) => ["recall-explain", lookup, kind ?? null, history, directory ?? null, at ?? null] as const,
  repointPreview: (from: string, to: string) => ["repoint-preview", from, to] as const,
  reviewContext: (directory: string | undefined, at: ReadonlyArray<string> | undefined) =>
    ["context", directory ?? null, at ?? null] as const,
};

/** Any key the screens query under; a prefix of one refreshes every query beneath it. */
export type ReviewQueryKey = ReturnType<(typeof REVIEW_QUERY_KEYS)[keyof typeof REVIEW_QUERY_KEYS]>;

/** What a write makes stale: the listed key families, or every query. */
export type ReviewStaleBundle = "every-query" | ReadonlyArray<ReviewQueryKey>;

/** A decision, revision or repoint can change any screen's counts, so everything re-reads. */
export const STORE_WRITE_STALES = "every-query";

/** A thread note changes only the record it was posted on (and any open record). */
export const THREAD_NOTE_STALES = [REVIEW_QUERY_KEYS.records()];

/** The acknowledgements an accept needs, re-read for one derivation. */
export const acceptPreviewsStaleOf = (ref: string) => [REVIEW_QUERY_KEYS.acceptPreviewsOf(ref)];

/** Agents write to the store from other processes and there is no push, so screens re-read this often. */
export const REVIEW_POLL_MS = 1_000;
