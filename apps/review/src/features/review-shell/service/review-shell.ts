import { mapReviewOutcome } from "#review/shared/review-outcome.ts";

import {
  readCatalogAndCounts,
  readCatalogContext,
  readPlacesInUse,
  readRecordWithListeners,
} from "../repo/review-shell.server.ts";

/** Header data every screen polls: the catalog view, the store root, and pending counts per kind. */
export const loadReviewShell = () => readCatalogAndCounts();

/** "Where am I?": the context the configured resolver gives a directory, or the places as typed. */
export const loadReviewContext = async (request: { readonly in?: string; readonly at?: ReadonlyArray<string> }) =>
  mapReviewOutcome(await readCatalogContext(request), (catalog) => catalog.context);

/** One record as `show` returns it, plus who is listening on threads (for a derivation's composer). */
export const loadRecordDetail = (ref: string) => readRecordWithListeners(ref);

/** Every place named by any scope, with its counts. */
export const loadKnownPlaces = async () => mapReviewOutcome(await readPlacesInUse(), (audit) => audit.places);
