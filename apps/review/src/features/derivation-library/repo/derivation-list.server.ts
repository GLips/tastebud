import type { TasteOperationInput } from "@tastebud/core/operations";

import { runReviewOperation } from "#review/infrastructure/tastebud-core.server.ts";

export const readDerivationList = (input: TasteOperationInput<"list">) => runReviewOperation("list", input);
