import { runReviewOperation } from "#review/infrastructure/tastebud-core.server.ts";

export const readSourcesOfKinds = (kind: ReadonlyArray<string> | undefined) =>
  runReviewOperation("list", { sources: true, ...(kind !== undefined && { kind }) });
