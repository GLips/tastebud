import { mapReviewOutcome } from "#review/shared/review-outcome.ts";

import { readSourceList, type SourceListFilter } from "../repo/source-list.server.ts";

/** Sources, optionally of some kinds or matching words. Speaker filtering happens in the browser. */
export const loadSourceList = async (filter: SourceListFilter) =>
  mapReviewOutcome(await readSourceList(filter), (listed) => listed.sources);
