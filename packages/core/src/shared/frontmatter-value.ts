/**
 * What a record file's frontmatter holds, read or written: strings, lists and mappings. Records keep
 * every scalar a string and the codec reads YAML `failsafe`, so no other scalar ever appears.
 */
import { Schema } from "effect";

export type FrontmatterValue = string | ReadonlyArray<FrontmatterValue> | FrontmatterMapping;
export interface FrontmatterMapping {
  readonly [field: string]: FrontmatterValue;
}

const FrontmatterValueSchema: Schema.Codec<FrontmatterValue> = Schema.Union([
  Schema.String,
  Schema.Array(Schema.suspend(() => FrontmatterValueSchema)),
  Schema.Record(
    Schema.String,
    Schema.suspend(() => FrontmatterValueSchema),
  ),
]);

/** The top level is always a mapping: a record is a set of named fields. */
export const FrontmatterMappingSchema: Schema.Codec<FrontmatterMapping> = Schema.Record(
  Schema.String,
  FrontmatterValueSchema,
);
