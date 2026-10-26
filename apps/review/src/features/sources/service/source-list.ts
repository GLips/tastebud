import { mapReviewOutcome } from "#review/shared/review-outcome.ts";

import { readSourcesOfKinds } from "../repo/source-list.server.ts";

/** Every source, optionally of some kinds. Speaker filtering happens in the browser. */
export const loadSourceList = async (kind: ReadonlyArray<string> | undefined) =>
  mapReviewOutcome(await readSourcesOfKinds(kind), (listed) => listed.sources);
