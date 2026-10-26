/** A record as file text and back: the records domain's layout joined with the yaml codec. */
import { Effect, Result } from "effect";

import {
  decodeRecordFileParts,
  joinRecordFileText,
  recordFileParts,
  splitRecordFileText,
  type TasteRecord,
} from "#core/domains/records/index.ts";
import { parseFrontmatter, stringifyFrontmatter } from "#core/infrastructure/frontmatter-codec.ts";

export const renderRecordFileText = (record: TasteRecord): string => {
  const parts = recordFileParts(record);
  return joinRecordFileText(stringifyFrontmatter(parts.frontmatter), parts.body);
};

/** Reads one record file. Frontmatter is parsed `failsafe`, so every scalar arrives as a string. */
export const decodeRecordFileText = Effect.fn("record-store.decodeRecordFileText")(function* (
  path: string,
  content: string,
) {
  const split = splitRecordFileText(path, content);
  if (Result.isFailure(split)) return yield* split.failure;
  const frontmatter = yield* parseFrontmatter(path, split.success.frontmatterText);
  return yield* decodeRecordFileParts(path, frontmatter, split.success.body);
});
