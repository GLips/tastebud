/**
 * The turn before the prompt now being submitted, read from the tail of a Claude Code transcript:
 * what the assistant said and which files its tools touched, and which derivations earlier hook
 * runs sent, each aged in owner turns. Only what follows the latest `compact_boundary` counts, since
 * compaction drops the rest from the conversation. How recent counts as a repeat is core's call.
 */
import {
  parseHookEmissionMarkers,
  PREVIOUS_TURN_LIMITS,
  type PreviousTurnEvidence,
  type RecordedHookEmission,
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

/**
 * Turn origins Claude Code gives prompts nobody typed: another agent's message, a notification, a
 * harness prompt, a resume after a usage limit. Any other origin is the owner, whether typed (`human`),
 * sent through the SDK or `claude -p` (`sdk`), or set up to recur (`scheduled`).
 */
const NOT_OWNER_TURN_ORIGINS = new Set(["peer", "task_notification", "system", "auto_continuation"]);

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
  if (record.promptSource === "system" || NOT_OWNER_TURN_ORIGINS.has(record.turnOrigin ?? "")) return false;
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

/** Every hook emission in `records`, aged by the owner messages (at indexes `userAt`) recorded after it. */
const emissionsIn = (
  records: ReadonlyArray<TranscriptRecord>,
  userAt: ReadonlyArray<number>,
): Array<RecordedHookEmission> =>
  records.flatMap((record, index) => {
    if (record.type !== "attachment" || record.isSidechain === true) return [];
    const ownerTurnsAgo = userAt.filter((userIndex) => userIndex > index).length;
    return record.attachment.content
      .flatMap(parseHookEmissionMarkers)
      .map(({ id, fingerprint }) => ({ id, fingerprint, ownerTurnsAgo }));
  });

/**
 * `lines` are whole JSONL lines from the end of the transcript. The prompt being submitted is
 * normally not written yet when the hook runs; if it already is, it is set aside rather than taken
 * for the previous turn, and doesn't age the emissions.
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
  const previousTurn = previousTurnOf(records.slice(turnStart, end));
  const earlierEmissions = emissionsIn(records.slice(0, end), userAt);
  return previousTurn === undefined
    ? { status: "read", earlierEmissions }
    : { status: "read", previousTurn, earlierEmissions };
};
