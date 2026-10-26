/** The one place a write refreshes queries; what it makes stale is a bundle from `query-keys.ts`. */
import type { QueryClient } from "@tanstack/react-query";

import type { ReviewStaleBundle } from "./query-keys.ts";

export const refreshReviewQueriesAfterWrite = async (queryClient: QueryClient, stale: ReviewStaleBundle) => {
  if (stale === "every-query") return queryClient.invalidateQueries();
  await Promise.all(stale.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
};
