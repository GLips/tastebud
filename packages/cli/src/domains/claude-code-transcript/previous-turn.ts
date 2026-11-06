/**
 * The turn before the prompt now being submitted, read from the tail of a Claude Code transcript:
 * what the assistant said and which files its tools touched, and which derivations recent hook runs
 * already sent. Only what follows the latest `compact_boundary` counts, since compaction drops the
 * rest from the conversation.
 */
import {
  HOOK_REPEAT_WINDOW_TURNS,
  type HookEmission,
  parseHookEmissionMarkers,
  PREVIOUS_TURN_LIMITS,
  type PreviousTurnEvidence,
  type TouchedPath,
  type TranscriptReading,
} from "@tastebud/core/hook-evidence";

import {
  isToolResultBlock,
  textOfBlock,
  type ToolTouch,
  toolTouchOf,
  type TranscriptRecord,
  transcriptRecordOf,
  type UserRecord,
} from "./transcript-records.ts";

/** User-role text Claude Code writes itself: command output, task notifications, interruptions. */
const HARNESS_TEXT_PREFIXES = ["<local-command-", "<task-notification>", "[Request interrupted"];

const userTextOf = (record: UserRecord): string =>
  typeof record.message.content === "string"
    ? record.message.content
    : record.message.content
        .map(textOfBlock)
        .filter((text) => text !== undefined)
        .join("\n");

/**
 * Something the owner sent, as opposed to a tool result, a skill body, a compaction summary or a
 * notification, all of which Claude Code also records as `user`.
 */
const isRealUserMessage = (record: TranscriptRecord): record is UserRecord => {
  if (record.type !== "user") return false;
  if (record.isSidechain === true || record.isMeta === true || record.isCompactSummary === true) return false;
  if (record.promptSource === "system" || (record.turnOrigin !== undefined && record.turnOrigin !== "human"))
    return false;
  if (typeof record.message.content !== "string" && record.message.content.some(isToolResultBlock)) return false;
  const text = userTextOf(record).trimStart();
  return !HARNESS_TEXT_PREFIXES.some((prefix) => text.startsWith(prefix));
};

const isMainAssistant = (record: TranscriptRecord) => record.type === "assistant" && record.isSidechain !== true;

/** Keeps the end of `text`, where a turn sums up what it did. */
const lastChars = (text: string, limit: number) => (text.length <= limit ? text : text.slice(text.length - limit));

const touchedPathsOf = (touches: ReadonlyArray<ToolTouch>): Array<TouchedPath> => {
  const latestFirst = touches.toReversed();
  const modified = new Set(latestFirst.filter((touch) => touch.access === "modified").map((touch) => touch.path));
  const read = new Set(latestFirst.filter((touch) => !modified.has(touch.path)).map((touch) => touch.path));
  return [
    ...[...modified].map((path): TouchedPath => ({ path, access: "modified" })),
    ...[...read].map((path): TouchedPath => ({ path, access: "read" })),
  ].slice(0, PREVIOUS_TURN_LIMITS.touchedPaths);
};

const previousTurnOf = (records: ReadonlyArray<TranscriptRecord>): PreviousTurnEvidence | undefined => {
  const prose: Array<string> = [];
  const touches: Array<ToolTouch> = [];
  for (const record of records) {
    if (record.type !== "assistant" || !isMainAssistant(record)) continue;
    for (const block of record.message.content) {
      const text = textOfBlock(block);
      if (text !== undefined) prose.push(text);
      const touch = toolTouchOf(block);
      if (touch !== undefined) touches.push(touch);
    }
  }
  const written = touches.map((touch) => touch.written).filter((text) => text !== "");
  if (prose.length === 0 && touches.length === 0) return undefined;
  return {
    assistantProse: lastChars(prose.join("\n\n"), PREVIOUS_TURN_LIMITS.proseChars),
    touchedPaths: touchedPathsOf(touches),
    changedText: lastChars(written.join("\n"), PREVIOUS_TURN_LIMITS.changedTextChars),
  };
};

const emissionsIn = (records: ReadonlyArray<TranscriptRecord>): Array<HookEmission> =>
  records.flatMap((record) =>
    record.type === "attachment" && record.isSidechain !== true
      ? record.attachment.content.flatMap(parseHookEmissionMarkers)
      : [],
  );

/**
 * `lines` are whole JSONL lines from the end of the transcript. The prompt being submitted is
 * normally not written yet when the hook runs; if it already is, it is set aside rather than taken
 * for the previous turn. Hook output recorded after the third-latest owner message is recent.
 */
export const readClaudeCodeTranscriptLines = (lines: ReadonlyArray<string>, prompt: string): TranscriptReading => {
  const decoded = lines.map(transcriptRecordOf).filter((record) => record !== undefined);
  const boundary = decoded.findLastIndex((record) => record.type === "system" && record.subtype === "compact_boundary");
  const records = decoded.slice(boundary + 1);
  const userAt = records.flatMap((record, index) => (isRealUserMessage(record) ? [index] : []));
  let end = records.length;
  const lastUser = userAt.at(-1);
  if (lastUser !== undefined) {
    const latest = records[lastUser];
    const answered = records.slice(lastUser + 1).some(isMainAssistant);
    if (latest !== undefined && isRealUserMessage(latest) && !answered && userTextOf(latest).trim() === prompt.trim()) {
      end = lastUser;
      userAt.pop();
    }
  }
  const turnStart = (userAt.at(-1) ?? -1) + 1;
  const recentStart = userAt.length >= HOOK_REPEAT_WINDOW_TURNS ? (userAt.at(-HOOK_REPEAT_WINDOW_TURNS) ?? 0) : 0;
  const previousTurn = previousTurnOf(records.slice(turnStart, end));
  const recentEmissions = emissionsIn(records.slice(recentStart, end));
  return previousTurn === undefined
    ? { status: "read", recentEmissions }
    : { status: "read", previousTurn, recentEmissions };
};
