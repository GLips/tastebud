import { Data } from "effect";

/** A capture by transcript reference whose quote isn't an exact stretch of one eligible part of the message. */
export class TranscriptQuoteNotFound extends Data.TaggedError("TranscriptQuoteNotFound")<{
  readonly session: string;
  readonly messageId: string;
}> {
  override get message() {
    return `The quote isn't an exact, contiguous stretch of one part of message ${this.messageId} in transcript session ${this.session}. Copy it character for character from one of the parts \`tastebud transcript-candidates\` lists.`;
  }
}

/**
 * A capture by transcript reference that also gave a speaker, time, place or address the transcript
 * contradicts. The transcript's word stands; the caller's is refused rather than overridden.
 */
export class TranscriptFieldConflict extends Data.TaggedError("TranscriptFieldConflict")<{
  readonly field: string;
  readonly given: string;
  readonly transcript: string;
}> {
  override get message() {
    return `${this.field} is ${JSON.stringify(this.given)}, but the transcript says ${JSON.stringify(this.transcript)}. Leave ${this.field} out when capturing by transcript reference.`;
  }
}
