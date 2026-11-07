/** The owner's decisions and notes: written here and nowhere else in the review UI, as the store owner. */
import type { TasteOperationInput } from "@tastebud/core/operations";

import {
  readAcceptPreview,
  readInboxGroups,
  writeDecision,
  writeOwnerThreadNote,
} from "../repo/derivation-decisions.server.ts";

/** Pending derivations grouped by kind, scope and subject, each with what an accept must acknowledge. */
export const loadInboxGroups = () => readInboxGroups();

/** What accepting with a scope would settle on, and the near repeats it must acknowledge. */
export const loadAcceptPreview = (input: TasteOperationInput<"accept-preview">) => readAcceptPreview(input);

/** Accept (with a scope and acknowledgements), reject or retract; accepting again moves the scope. */
export const recordOwnerDecision = (input: TasteOperationInput<"decide">) => writeDecision(input);

/** The owner's note on a thread: the browser never names an author. */
export const recordOwnerThreadNote = (input: TasteOperationInput<"thread-note">) => writeOwnerThreadNote(input);
