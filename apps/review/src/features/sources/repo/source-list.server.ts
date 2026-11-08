import { runReviewOperation } from "#review/infrastructure/tastebud-core.server.ts";

export interface SourceListFilter {
  readonly kind?: ReadonlyArray<string> | undefined;
  readonly text?: string | undefined;
}

export const readSourceList = ({ kind, text }: SourceListFilter) =>
  runReviewOperation("list", {
    sources: true,
    ...(kind !== undefined && { kind }),
    ...(text !== undefined && { text }),
  });
