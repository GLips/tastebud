import type { TasteOperationInput } from "@tastebud/core/operations";

import { runReviewOperation } from "#review/infrastructure/tastebud-core.server.ts";

export const readPlacesAudit = (input: TasteOperationInput<"places">) => runReviewOperation("places", input);
export const writeRepointProposals = (input: TasteOperationInput<"repoint">) => runReviewOperation("repoint", input);
export const readRepointPreview = (input: TasteOperationInput<"repoint-preview">) =>
  runReviewOperation("repoint-preview", input);
