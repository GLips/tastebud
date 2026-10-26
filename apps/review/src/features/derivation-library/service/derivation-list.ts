import type { TasteOperationInput } from "@taste/core/operations";

import { readDerivationList } from "../repo/derivation-list.server.ts";

/** A kind's library: derivations filtered by status, place and text. */
export const loadDerivationList = (input: TasteOperationInput<"list">) => readDerivationList(input);
