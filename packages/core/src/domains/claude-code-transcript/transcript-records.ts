/**
 * The Claude Code transcript records the prompt hook and transcript mining read, decoded from JSONL
 * lines. Claude Code writes many more record types (api requests, snapshots, mode changes); those,
 * and any line that doesn't parse, decode to nothing and are skipped.
 */
import { Option, Schema } from "effect";

const TextBlockSchema = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String });

const toolUse = <Name extends string, Input extends Schema.Struct.Fields>(name: Name, input: Input) =>
  Schema.Struct({
    type: Schema.Literal("tool_use"),
    id: Schema.String,
    name: Schema.Literal(name),
    input: Schema.Struct(input),
  });

/**
 * The `user`-record block answering a tool call. Claude Code sets `is_error` when the call failed
 * or was denied (seen in 2.1.319); a success leaves it out or false.
 */
const ToolResultBlockSchema = Schema.Struct({
  type: Schema.Literal("tool_result"),
  tool_use_id: Schema.String,
  is_error: Schema.optionalKey(Schema.Boolean),
});

/**
 * Content blocks by what the hook does with them. A tool call it doesn't read, or whose input has
 * another shape, lands in the last member with thinking and images.
 */
const ContentBlockSchema = Schema.Union([
  TextBlockSchema,
  ToolResultBlockSchema,
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

/** Where a message sits and who started it: what mining needs to cite a message and judge it. */
const messageFields = {
  uuid: Schema.optionalKey(Schema.String),
  timestamp: Schema.optionalKey(Schema.String),
  cwd: Schema.optionalKey(Schema.String),
  /** `cli` for the interactive terminal; `sdk-cli` and other `sdk-*` values for headless runs. */
  entrypoint: Schema.optionalKey(Schema.String),
};

/** Who started a turn: `{ kind: "human" }` for the owner, `peer`, `task-notification`, `plugin` and others for the rest. */
const OriginField = Schema.optionalKey(Schema.Struct({ kind: Schema.optionalKey(Schema.String) }));

const UserRecordSchema = Schema.Struct({
  type: Schema.Literal("user"),
  ...messageFields,
  isSidechain: Schema.optionalKey(Schema.Boolean),
  isMeta: Schema.optionalKey(Schema.Boolean),
  isCompactSummary: Schema.optionalKey(Schema.Boolean),
  /** `typed`, `queued`, `sdk`; `system` for task notifications. Absent in older versions. */
  promptSource: Schema.optionalKey(Schema.String),
  /** `human`, `sdk` or `scheduled` for the owner's turns; `peer`, `system` and others for the rest. Absent in older versions and on tool results. */
  turnOrigin: Schema.optionalKey(Schema.String),
  origin: OriginField,
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

/**
 * A message the owner sent while the agent was working, delivered inside the running turn (seen in
 * 2.1.319). `origin` and `commandMode` tell it apart from task notifications delivered the same way.
 */
const QueuedCommandRecordSchema = Schema.Struct({
  type: Schema.Literal("attachment"),
  isSidechain: Schema.optionalKey(Schema.Boolean),
  ...messageFields,
  attachment: Schema.Struct({
    type: Schema.Literal("queued_command"),
    prompt: Schema.Union([Schema.String, Schema.Array(ContentBlockSchema)]),
    commandMode: Schema.optionalKey(Schema.String),
    origin: OriginField,
    humanTurn: Schema.optionalKey(Schema.Boolean),
    isMeta: Schema.optionalKey(Schema.Boolean),
  }),
});
export type QueuedCommandRecord = typeof QueuedCommandRecordSchema.Type;

const TranscriptRecordSchema = Schema.Union([
  UserRecordSchema,
  AssistantRecordSchema,
  CompactBoundarySchema,
  HookContextRecordSchema,
  QueuedCommandRecordSchema,
]);
export type TranscriptRecord = typeof TranscriptRecordSchema.Type;

const decodeTranscriptLine = Schema.decodeUnknownOption(Schema.fromJsonString(TranscriptRecordSchema));

/** One JSONL line as a record the hook reads, or undefined. */
export const transcriptRecordOf = (line: string): TranscriptRecord | undefined =>
  Option.getOrUndefined(decodeTranscriptLine(line));

export const isHookContextRecord = Schema.is(HookContextRecordSchema);
export const isQueuedCommandRecord = Schema.is(QueuedCommandRecordSchema);

export const textOfBlock = (block: ContentBlock): string | undefined =>
  Schema.is(TextBlockSchema)(block) ? block.text : undefined;

export const isToolResultBlock = Schema.is(ToolResultBlockSchema);

/** Ids of the tool calls in `records` whose result came back without an error. */
export const succeededToolUseIdsOf = (records: ReadonlyArray<TranscriptRecord>): ReadonlySet<string> =>
  new Set(
    records.flatMap((record) =>
      record.type === "user" && typeof record.message.content !== "string"
        ? record.message.content
            .filter(isToolResultBlock)
            .filter((block) => block.is_error !== true)
            .map((block) => block.tool_use_id)
        : [],
    ),
  );

export interface ToolTouch {
  readonly toolUseId: string;
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
      return { toolUseId: block.id, path: block.input.file_path, access: "modified", written: block.input.new_string };
    case "Write":
      return { toolUseId: block.id, path: block.input.file_path, access: "modified", written: block.input.content };
    case "MultiEdit":
      return {
        toolUseId: block.id,
        path: block.input.file_path,
        access: "modified",
        written: block.input.edits.map((edit) => edit.new_string).join("\n"),
      };
    case "NotebookEdit":
      return {
        toolUseId: block.id,
        path: block.input.notebook_path,
        access: "modified",
        written: block.input.new_source ?? "",
      };
    case "Read":
      return { toolUseId: block.id, path: block.input.file_path, access: "read", written: "" };
  }
};
