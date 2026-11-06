/**
 * Which Claude Code messages hold words the owner typed, for mining past sessions. Stricter than the
 * prompt hook's turn rule: a message counts only on positive evidence of an interactive human turn,
 * so missing or unfamiliar metadata leaves it out (counted as unknown) rather than in.
 */
import { Schema } from "effect";

import { isSlashCommandText, type OwnerTextParts, ownerTextPartsOf, slashCommandOf } from "./owner-text-parts.ts";
import {
  isQueuedCommandRecord,
  isToolResultBlock,
  type QueuedCommandRecord,
  textOfBlock,
  type TranscriptRecord,
  transcriptRecordOf,
  type UserRecord,
} from "./transcript-records.ts";

/**
 * Why a message's words are the owner's: typed at the prompt, typed while the agent worked and sent
 * as the next turn (`queued`) or inside the running one (`mid-turn`), or typed after a slash command.
 */
export const TRANSCRIPT_ELIGIBILITY_REASONS = ["typed", "queued", "mid-turn", "command-args"] as const;
export const TranscriptEligibilityReasonSchema = Schema.Literals(TRANSCRIPT_ELIGIBILITY_REASONS);
export type TranscriptEligibilityReason = (typeof TRANSCRIPT_ELIGIBILITY_REASONS)[number];

export interface EligibleTranscriptMessage {
  readonly status: "eligible";
  readonly uuid: string;
  readonly timestamp: string;
  readonly cwd: string;
  /** The owner's text with wrappers cut out, one entry per stretch between them. */
  readonly parts: ReadonlyArray<string>;
  readonly because: TranscriptEligibilityReason;
}

/** Where a record says it was sent, as far as it says. */
interface TranscriptMessagePlace {
  readonly uuid?: string | undefined;
  readonly timestamp?: string | undefined;
  readonly cwd?: string | undefined;
}

/** `excluded`: the record says it is not an interactive human turn. `unknown`: it doesn't say enough. */
export interface IneligibleTranscriptMessage {
  readonly status: "excluded" | "unknown";
  readonly uuid: string | undefined;
  readonly timestamp: string | undefined;
  readonly cwd: string | undefined;
  readonly problem: string;
}

export type MinedTranscriptMessage = EligibleTranscriptMessage | IneligibleTranscriptMessage;

const ineligible =
  (status: IneligibleTranscriptMessage["status"]) =>
  (record: TranscriptMessagePlace, problem: string): IneligibleTranscriptMessage => ({
    status,
    uuid: record.uuid,
    timestamp: record.timestamp,
    cwd: record.cwd,
    problem,
  });
const excluded = ineligible("excluded");
const unknown = ineligible("unknown");

/** Values Claude Code writes for turns nobody typed at the interactive prompt (seen in 2.1.3xx). */
const NOT_HUMAN_PROMPT_SOURCES = new Set(["sdk", "system"]);
const NOT_HUMAN_TURN_ORIGINS = new Set([
  "sdk",
  "scheduled",
  "peer",
  "task_notification",
  "system",
  "auto_continuation",
]);
const NOT_HUMAN_ORIGIN_KINDS = new Set(["peer", "task-notification", "plugin", "system", "sdk", "scheduled"]);
const NOT_HUMAN_COMMAND_MODES = new Set(["task-notification"]);

interface TurnSignal {
  readonly field: string;
  readonly value: string | undefined;
  readonly human: ReadonlySet<string>;
  readonly notHuman: (value: string) => boolean;
}

/**
 * A known non-human value anywhere excludes the message, conflicting fields included; a missing or
 * unfamiliar one makes it unknown. Only all-human signals let it through.
 */
const judgeTurnSignals = (record: TranscriptMessagePlace, signals: ReadonlyArray<TurnSignal>) => {
  for (const signal of signals)
    if (signal.value !== undefined && signal.notHuman(signal.value))
      return excluded(record, `${signal.field} is ${signal.value}`);
  for (const signal of signals) {
    if (signal.value === undefined) return unknown(record, `no ${signal.field}`);
    if (!signal.human.has(signal.value)) return unknown(record, `unfamiliar ${signal.field} ${signal.value}`);
  }
  return undefined;
};

const entrypointSignal = (value: string | undefined): TurnSignal => ({
  field: "entrypoint",
  value,
  human: new Set(["cli"]),
  notHuman: (entrypoint) => entrypoint.startsWith("sdk"),
});
const originSignal = (origin: UserRecord["origin"]): TurnSignal => ({
  field: "origin.kind",
  value: origin?.kind,
  human: new Set(["human"]),
  notHuman: (kind) => NOT_HUMAN_ORIGIN_KINDS.has(kind),
});

const textsOf = (content: UserRecord["message"]["content"]): ReadonlyArray<string> =>
  typeof content === "string" ? [content] : content.map(textOfBlock).filter((text) => text !== undefined);

/** Every text's parts, or the first unknown wrapper among them. */
const partsOfTexts = (texts: ReadonlyArray<string>): OwnerTextParts => {
  const parts: Array<string> = [];
  for (const text of texts) {
    const found = ownerTextPartsOf(text);
    if (found.status === "unknown-wrapper") return found;
    parts.push(...found.parts);
  }
  return { status: "parts", parts };
};

const eligibleWithParts = (
  record: TranscriptMessagePlace,
  found: OwnerTextParts,
  because: TranscriptEligibilityReason,
): MinedTranscriptMessage => {
  const { uuid, timestamp, cwd } = record;
  if (found.status === "unknown-wrapper") return unknown(record, `unknown wrapper <${found.wrapper}>`);
  if (found.parts.length === 0) return excluded(record, "nothing typed outside Claude Code's wrappers");
  if (uuid === undefined || timestamp === undefined || cwd === undefined || Number.isNaN(Date.parse(timestamp)))
    return unknown(record, "no uuid, readable timestamp or cwd to cite it by");
  return { status: "eligible", uuid, timestamp, cwd, parts: found.parts, because };
};

/**
 * Claude Code records a slash command without `promptSource` (2.1.3xx), so the human turn fields
 * must say human and `promptSource` must be absent or `typed`. The skill body that follows is its
 * own `isMeta` record.
 */
const mineSlashCommand = (record: UserRecord, text: string): MinedTranscriptMessage => {
  const judged = judgeTurnSignals(record, [
    entrypointSignal(record.entrypoint),
    {
      field: "turnOrigin",
      value: record.turnOrigin,
      human: new Set(["human"]),
      notHuman: (origin) => NOT_HUMAN_TURN_ORIGINS.has(origin),
    },
    originSignal(record.origin),
  ]);
  if (judged !== undefined) return judged;
  if (record.promptSource !== undefined && record.promptSource !== "typed")
    return excluded(record, `a slash command with promptSource ${record.promptSource}`);
  const command = slashCommandOf(text);
  if (command.args.trim() === "") return excluded(record, `${command.name || "a slash command"} without arguments`);
  return eligibleWithParts(record, ownerTextPartsOf(command.args), "command-args");
};

const mineUserRecord = (record: UserRecord): MinedTranscriptMessage | undefined => {
  const { content } = record.message;
  if (typeof content !== "string" && content.some(isToolResultBlock)) return undefined;
  if (record.isSidechain === true) return excluded(record, "a subagent's conversation");
  if (record.isMeta === true) return excluded(record, "written by Claude Code (isMeta)");
  if (record.isCompactSummary === true) return excluded(record, "a compaction summary");
  const texts = textsOf(content);
  const [first] = texts;
  if (first !== undefined && isSlashCommandText(first)) return mineSlashCommand(record, first);
  const judged = judgeTurnSignals(record, [
    entrypointSignal(record.entrypoint),
    {
      field: "promptSource",
      value: record.promptSource,
      human: new Set(["typed", "queued"]),
      notHuman: (source) => NOT_HUMAN_PROMPT_SOURCES.has(source),
    },
    {
      field: "turnOrigin",
      value: record.turnOrigin,
      human: new Set(["human"]),
      notHuman: (origin) => NOT_HUMAN_TURN_ORIGINS.has(origin),
    },
    originSignal(record.origin),
  ]);
  if (judged !== undefined) return judged;
  return eligibleWithParts(record, partsOfTexts(texts), record.promptSource === "queued" ? "queued" : "typed");
};

/** A mid-turn message: no `promptSource` or `turnOrigin`, but `humanTurn` and a human origin. */
const mineQueuedCommand = (record: QueuedCommandRecord): MinedTranscriptMessage => {
  const { attachment } = record;
  if (record.isSidechain === true) return excluded(record, "a subagent's conversation");
  if (attachment.isMeta === true) return excluded(record, "written by Claude Code (isMeta)");
  const judged = judgeTurnSignals(record, [
    entrypointSignal(record.entrypoint),
    {
      field: "commandMode",
      value: attachment.commandMode,
      human: new Set(["prompt"]),
      notHuman: (mode) => NOT_HUMAN_COMMAND_MODES.has(mode),
    },
    originSignal(attachment.origin),
    {
      field: "humanTurn",
      value: attachment.humanTurn === undefined ? undefined : String(attachment.humanTurn),
      human: new Set(["true"]),
      notHuman: (humanTurn) => humanTurn === "false",
    },
  ]);
  if (judged !== undefined) return judged;
  return eligibleWithParts(record, partsOfTexts(textsOf(attachment.prompt)), "mid-turn");
};

/** A record's verdict, or undefined for records that are not messages (assistant turns, tool results, …). */
const mineTranscriptRecord = (record: TranscriptRecord): MinedTranscriptMessage | undefined => {
  if (record.type === "user") return mineUserRecord(record);
  if (isQueuedCommandRecord(record)) return mineQueuedCommand(record);
  return undefined;
};

/** Every message in a transcript's JSONL lines, judged by the mining rule. */
export const mineClaudeCodeTranscriptLines = (lines: ReadonlyArray<string>): ReadonlyArray<MinedTranscriptMessage> =>
  lines.flatMap((line) => {
    const record = transcriptRecordOf(line);
    const mined = record === undefined ? undefined : mineTranscriptRecord(record);
    return mined === undefined ? [] : [mined];
  });

/** Whether `quote` is an exact, contiguous stretch of one part; a quote across two parts is not. */
export const quoteFitsTranscriptParts = (parts: ReadonlyArray<string>, quote: string): boolean =>
  parts.some((part) => part.includes(quote));

/** The `address` a source captured from a transcript message carries, so a second capture finds it. */
export const claudeCodeTranscriptAddress = (session: string, message: string): string =>
  `claude-code-transcript:${session}/${message}`;
