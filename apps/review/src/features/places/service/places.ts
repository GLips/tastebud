import type { TasteOperationInput } from "@tastebud/core/operations";

import { readPlacesAudit, readRepointPreview, writeRepointProposals } from "../repo/places.server.ts";

/** Places in use with counts, and the audit against the probes the reviewer keeps in the browser. */
export const loadPlacesAudit = (input: TasteOperationInput<"places">) => readPlacesAudit(input);

/** Proposes revisions replacing exact place `from` with `to`; each still needs the owner's accept. */
export const proposeRepoint = (input: TasteOperationInput<"repoint">) => writeRepointProposals(input);

/** What repointing `from` to `to` would propose, written nowhere. */
export const loadRepointPreview = (input: TasteOperationInput<"repoint-preview">) => readRepointPreview(input);
