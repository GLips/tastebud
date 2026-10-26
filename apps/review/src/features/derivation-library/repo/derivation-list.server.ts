import type { TasteOperationInput } from "@taste/core/operations";

import { runReviewOperation } from "#review/infrastructure/taste-core.server.ts";

export const readDerivationList = (input: TasteOperationInput<"list">) => runReviewOperation("list", input);
