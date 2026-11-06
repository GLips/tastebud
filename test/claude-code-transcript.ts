/**
 * Claude Code transcript lines for hook and mining fixtures, shaped like the records Claude Code
 * 2.1.319 writes under ~/.claude/projects/: one JSON object per line, one content block per assistant
 * record, tool results as `user` records, and the hook's own output as a `hook_additional_context`
 * attachment. The words are invented; no real transcript text is copied here.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const common = (type: string) => ({
  parentUuid: null,
  isSidechain: false,
  type,
  uuid: crypto.randomUUID(),
  timestamp: "2026-11-05T10:00:00.000Z",
  userType: "external",
  entrypoint: "cli",
  sessionId: "fixture-session",
  version: "2.1.319",
  gitBranch: "main",
});

/** A prompt the owner typed, or (`sdk`) sent through the Agent SDK or `claude -p`. */
export const ownerTurn = (text: string, via: "typed" | "sdk" = "typed") => ({
  ...common("user"),
  ...(via === "sdk" && { entrypoint: "sdk-cli" }),
  promptId: crypto.randomUUID(),
  message: { role: "user", content: text },
  permissionMode: "auto",
  promptSource: via,
  turnOrigin: via === "sdk" ? "sdk" : "human",
  ...(via === "typed" && { origin: { kind: "human" } }),
});

const assistantRecord = (block: unknown) => ({
  ...common("assistant"),
  message: { model: "claude-opus-5-5", id: "msg_fixture", type: "message", role: "assistant", content: [block] },
  requestId: "req_fixture",
});

export const assistantSays = (text: string) => assistantRecord({ type: "text", text });

export const assistantThinks = (thinking: string) => assistantRecord({ type: "thinking", thinking, signature: "sig" });

/**
 * A tool call and the `user` record carrying its result, which is never the owner speaking. A
 * `failed` call is recorded as Claude Code records a refused or denied one: `is_error`, the reason
 * wrapped in `<tool_use_error>`, and the reason again as a string `toolUseResult`.
 */
export const toolCall = (
  name: string,
  input: Record<string, unknown>,
  result: string,
  outcome: "succeeded" | "failed" = "succeeded",
) => {
  const id = `toolu_${crypto.randomUUID().replaceAll("-", "")}`;
  const failed = outcome === "failed";
  return [
    assistantRecord({ type: "tool_use", id, name, input, caller: { type: "direct" } }),
    {
      ...common("user"),
      message: {
        role: "user",
        content: [
          {
            tool_use_id: id,
            type: "tool_result",
            content: failed ? `<tool_use_error>${result}</tool_use_error>` : result,
            is_error: failed,
          },
        ],
      },
      toolUseResult: failed ? `Error: ${result}` : { type: "text" },
    },
  ];
};

/** What Claude Code records after a UserPromptSubmit hook printed `additionalContext`. */
export const hookContext = (additionalContext: string) => ({
  ...common("attachment"),
  attachment: {
    type: "hook_additional_context",
    content: [additionalContext],
    hookName: "UserPromptSubmit",
    toolUseID: `hook-${crypto.randomUUID()}`,
    hookEvent: "UserPromptSubmit",
  },
  rendered: [
    {
      content: `<system-reminder>\nUserPromptSubmit hook additional context: ${additionalContext}\n</system-reminder>`,
    },
  ],
});

export const compactBoundary = () => ({
  ...common("system"),
  subtype: "compact_boundary",
  content: "Conversation compacted",
  level: "info",
  compactMetadata: { trigger: "auto", preTokens: 300000, postTokens: 20000 },
});

export const compactSummary = (text: string) => ({
  ...common("user"),
  isCompactSummary: true,
  isVisibleInTranscriptOnly: true,
  message: { role: "user", content: `This session is being continued from a previous conversation. ${text}` },
});

/** Records Claude Code writes around every turn that carry nothing the hook reads. */
export const housekeeping = () => [
  { ...common("attachment"), attachment: { type: "date", date: "2026-11-05" } },
  { type: "last-prompt", sessionId: "fixture-session" },
  { type: "file-history-snapshot", messageId: "m", snapshot: {} },
];

/** Writes `records` as a JSONL transcript in `directory`; nested arrays are flattened at any depth. */
export const writeTranscript = (directory: string, records: ReadonlyArray<unknown>) => {
  const path = join(directory, "transcript.jsonl");
  writeFileSync(
    path,
    `${records
      .flat(Number.POSITIVE_INFINITY)
      .map((record) => JSON.stringify(record))
      .join("\n")}\n`,
  );
  return path;
};

/** Typed while the agent worked and sent as the next turn. */
export const queuedTurn = (text: string) => ({ ...ownerTurn(text), promptSource: "queued" });

/** Typed while the agent worked and delivered inside the running turn, as Claude Code records it. */
export const midTurnMessage = (prompt: string, origin: "human" | "task-notification" = "human") => ({
  ...common("attachment"),
  attachment: {
    type: "queued_command",
    prompt,
    source_uuid: crypto.randomUUID(),
    commandMode: origin === "human" ? "prompt" : "task-notification",
    origin: { kind: origin },
    ...(origin === "human" && { humanTurn: true }),
  },
});

/**
 * A slash command and the skill body Claude Code expands it into, a separate `isMeta` record. The
 * command record carries no `promptSource`.
 */
export const slashCommand = (name: string, args: string, skillBody: string) => [
  {
    ...common("user"),
    promptId: crypto.randomUUID(),
    message: {
      role: "user",
      content: `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>\n<command-args>${args}</command-args>`,
    },
    origin: { kind: "human" },
    turnOrigin: "human",
  },
  { ...common("user"), isMeta: true, message: { role: "user", content: [{ type: "text", text: skillBody }] } },
];

/** A notification Claude Code sends the agent as a `user` record when a background task ends. */
export const taskNotification = (text: string) => ({
  ...common("user"),
  message: { role: "user", content: `<task-notification>\n<summary>${text}</summary>\n</task-notification>` },
  origin: { kind: "task-notification" },
  promptSource: "system",
  turnOrigin: "task_notification",
});

/** `records` placed in `cwd` at `timestamp`, as every record of a real session carries them. */
export const sentFrom = (cwd: string, timestamp: string, records: ReadonlyArray<unknown>) =>
  records.flat(Number.POSITIVE_INFINITY).map((record) => Object.assign({}, record, { cwd, timestamp }));

/** Writes a session's transcript where Claude Code keeps it: `<configDir>/projects/<project>/<session>.jsonl`. */
export const writeSessionTranscript = (
  configDir: string,
  project: string,
  session: string,
  records: ReadonlyArray<unknown>,
) => {
  const directory = join(configDir, "projects", project);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${session}.jsonl`);
  writeFileSync(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  return path;
};
