/** One message of a Claude Code transcript, by reference, if mining's rule counts it as the owner's typing. */
import { Effect, Schema } from "effect";

import { mineClaudeCodeTranscriptLines } from "#core/domains/claude-code-transcript/index.ts";
import {
  locateClaudeCodeTranscript,
  readClaudeCodeTranscriptFile,
} from "#core/infrastructure/claude-code-transcripts.ts";
import { TrimmedText } from "#core/shared/input-text.ts";

import { TranscriptMessageIneligible, TranscriptMessageNotFound } from "../errors.ts";

/** A message in a Claude Code transcript: its session id and its record uuid. */
export const TranscriptReferenceSchema = Schema.Struct({
  session: TrimmedText.annotate({ description: "The session id, from transcript-candidates" }),
  message: TrimmedText.annotate({ description: "The message uuid, from transcript-candidates" }),
});
export type TranscriptReference = typeof TranscriptReferenceSchema.Type;

export const readEligibleTranscriptMessage = Effect.fn("transcript-mining.readEligibleTranscriptMessage")(function* (
  reference: TranscriptReference,
) {
  const path = yield* locateClaudeCodeTranscript(reference.session);
  const mined = mineClaudeCodeTranscriptLines(yield* readClaudeCodeTranscriptFile(path));
  const found = mined.find((message) => message.uuid === reference.message);
  const target = { session: reference.session, messageId: reference.message };
  if (found === undefined) return yield* new TranscriptMessageNotFound(target);
  if (found.status !== "eligible") return yield* new TranscriptMessageIneligible({ ...target, problem: found.problem });
  return found;
});
