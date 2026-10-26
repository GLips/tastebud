import type { TasteOperationInput } from "@taste/core/operations";

import { runReviewOperation } from "#review/infrastructure/taste-core.server.ts";

export const readInboxGroups = () => runReviewOperation("inbox", {});
export const readAcceptPreview = (input: TasteOperationInput<"accept-preview">) =>
  runReviewOperation("accept-preview", input);
export const writeDecision = (input: TasteOperationInput<"decide">) => runReviewOperation("decide", input);
export const writeOwnerThreadNote = (input: TasteOperationInput<"thread-note">) =>
  runReviewOperation("thread-note", input);
export const writeScopeRevision = (input: TasteOperationInput<"revise-scope">) =>
  runReviewOperation("revise-scope", input);
