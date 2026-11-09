import { queryOptions } from "@tanstack/react-query";

import { REVIEW_QUERY_KEYS } from "#review/shared/query-keys.ts";
import { unwrapReviewOutcome } from "#review/shared/review-outcome.ts";

import { fetchAgentHostConnections } from "../controllers/agent-host-connections.ts";

export const agentHostConnectionsQuery = queryOptions({
  queryKey: REVIEW_QUERY_KEYS.agentHostConnections(),
  queryFn: async () => unwrapReviewOutcome(await fetchAgentHostConnections()),
  // Host configs change outside Tastebud, when the owner runs a connect line; returning to the tab rereads them.
  refetchOnWindowFocus: "always",
});
