/**
 * The yaml owner. Frontmatter is written with YAML's default schema so strings like "1" or "true"
 * are quoted for other readers (Obsidian, grep); it is read back `failsafe`, so nothing is coerced.
 */
import { Effect, Schema } from "effect";
import YAML from "yaml";

import { CorruptRecordFile } from "#core/shared/corrupt-record-file.ts";
import { type FrontmatterMapping, FrontmatterMappingSchema } from "#core/shared/frontmatter-value.ts";

export const stringifyFrontmatter = (fields: FrontmatterMapping): string => YAML.stringify(fields);

const decodeFrontmatterMapping = Schema.decodeUnknownEffect(FrontmatterMappingSchema);

/** Every scalar arrives as a string; the record schema decides what it means. */
export const parseFrontmatter = (path: string, text: string): Effect.Effect<FrontmatterMapping, CorruptRecordFile> =>
  Effect.try({
    try: () => {
      const parsed: unknown = YAML.parse(text, { schema: "failsafe" });
      return parsed;
    },
    catch: (error) => new CorruptRecordFile({ path, problem: String(error) }),
  }).pipe(
    Effect.flatMap((parsed) =>
      decodeFrontmatterMapping(parsed).pipe(
        Effect.mapError(() => new CorruptRecordFile({ path, problem: "frontmatter is not a mapping" })),
      ),
    ),
  );
