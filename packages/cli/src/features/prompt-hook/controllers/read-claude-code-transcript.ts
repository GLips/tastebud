/** A Claude Code transcript as the prompt hook and `hook preview --transcript` read it. */
import { readClaudeCodeTranscriptLines } from "@tastebud/core/claude-code-transcript";
import type { TranscriptReading } from "@tastebud/core/hook-evidence";
import { Effect } from "effect";

import { readTranscriptTailLines } from "#cli/infrastructure/transcript-tail.ts";

/** The previous turn and recent hook output in the transcript at `path`; `unavailable` when it can't be read. */
export const readClaudeCodeTranscript = Effect.fn("prompt-hook.readClaudeCodeTranscript")(function* (
  path: string,
  prompt: string,
) {
  return yield* readTranscriptTailLines(path).pipe(
    Effect.map((lines) => readClaudeCodeTranscriptLines(lines, prompt)),
    Effect.orElseSucceed((): TranscriptReading => ({ status: "unavailable" })),
  );
});
