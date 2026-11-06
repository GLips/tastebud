/**
 * The Claude Code transcript records the prompt hook reads, decoded from JSONL lines. Claude Code
 * writes many more record types (api requests, snapshots, mode changes); those, and any line that
 * doesn't parse, decode to nothing and are skipped.
 */
import { Option, Schema } from "effect";

const TextBlockSchema = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String });

const toolUse = <Name extends string, Input extends Schema.Struct.Fields>(name: Name, input: Input) =>
  Schema.Struct({ type: Schema.Literal("tool_use"), name: Schema.Literal(name), input: Schema.Struct(input) });

/**
 * Content blocks by what the hook does with them. A tool call it doesn't read, or whose input has
 * another shape, lands in `OtherBlock` with thinking, images and tool results.
 */
const ContentBlockSchema = Schema.Union([
  TextBlockSchema,
  toolUse("Edit", { file_path: Schema.String, new_string: Schema.String }),
  toolUse("Write", { file_path: Schema.String, content: Schema.String }),
  toolUse("MultiEdit", {
    file_path: Schema.String,
    edits: Schema.Array(Schema.Struct({ new_string: Schema.String })),
  }),
  toolUse("NotebookEdit", { notebook_path: Schema.String, new_source: Schema.optionalKey(Schema.String) }),
  toolUse("Read", { file_path: Schema.String }),
  Schema.Struct({ type: Schema.String }),
]);
type ContentBlock = typeof ContentBlockSchema.Type;

const UserRecordSchema = Schema.Struct({
  type: Schema.Literal("user"),
  isSidechain: Schema.optionalKey(Schema.Boolean),
  isMeta: Schema.optionalKey(Schema.Boolean),
  isCompactSummary: Schema.optionalKey(Schema.Boolean),
  /** `typed`, `queued`, `sdk`; `system` for task notifications. Absent in older versions. */
  promptSource: Schema.optionalKey(Schema.String),
  /** `human`, `sdk` or `scheduled` for the owner's turns; `peer`, `system` and others for the rest. Absent in older versions and on tool results. */
  turnOrigin: Schema.optionalKey(Schema.String),
  message: Schema.Struct({ content: Schema.Union([Schema.String, Schema.Array(ContentBlockSchema)]) }),
});
export type UserRecord = typeof UserRecordSchema.Type;

const AssistantRecordSchema = Schema.Struct({
  type: Schema.Literal("assistant"),
  isSidechain: Schema.optionalKey(Schema.Boolean),
  message: Schema.Struct({ content: Schema.Array(ContentBlockSchema) }),
});

const CompactBoundarySchema = Schema.Struct({
  type: Schema.Literal("system"),
  subtype: Schema.Literal("compact_boundary"),
});

/** How Claude Code records a UserPromptSubmit hook's `additionalContext` (seen in 2.1.319). */
const HookContextRecordSchema = Schema.Struct({
  type: Schema.Literal("attachment"),
  isSidechain: Schema.optionalKey(Schema.Boolean),
  attachment: Schema.Struct({
    type: Schema.Literal("hook_additional_context"),
    hookEvent: Schema.Literal("UserPromptSubmit"),
    content: Schema.Array(Schema.String),
  }),
});

const TranscriptRecordSchema = Schema.Union([
  UserRecordSchema,
  AssistantRecordSchema,
  CompactBoundarySchema,
  HookContextRecordSchema,
]);
export type TranscriptRecord = typeof TranscriptRecordSchema.Type;

const decodeTranscriptLine = Schema.decodeUnknownOption(Schema.fromJsonString(TranscriptRecordSchema));

/** One JSONL line as a record the hook reads, or undefined. */
export const transcriptRecordOf = (line: string): TranscriptRecord | undefined =>
  Option.getOrUndefined(decodeTranscriptLine(line));

export const textOfBlock = (block: ContentBlock): string | undefined =>
  Schema.is(TextBlockSchema)(block) ? block.text : undefined;

export const isToolResultBlock = (block: ContentBlock) => block.type === "tool_result";

export interface ToolTouch {
  readonly path: string;
  readonly access: "modified" | "read";
  /** What an edit wrote; empty for a read. */
  readonly written: string;
}

/** The file a tool call touched and the text it wrote, or undefined for any other block. */
export const toolTouchOf = (block: ContentBlock): ToolTouch | undefined => {
  if (!("name" in block)) return undefined;
  switch (block.name) {
    case "Edit":
      return { path: block.input.file_path, access: "modified", written: block.input.new_string };
    case "Write":
      return { path: block.input.file_path, access: "modified", written: block.input.content };
    case "MultiEdit":
      return {
        path: block.input.file_path,
        access: "modified",
        written: block.input.edits.map((edit) => edit.new_string).join("\n"),
      };
    case "NotebookEdit":
      return { path: block.input.notebook_path, access: "modified", written: block.input.new_source ?? "" };
    case "Read":
      return { path: block.input.file_path, access: "read", written: "" };
  }
};
