import { runReviewOperation } from "#review/infrastructure/tastebud-core.server.ts";

export const readAgentHostConnections = () => runReviewOperation("hosts", {});
