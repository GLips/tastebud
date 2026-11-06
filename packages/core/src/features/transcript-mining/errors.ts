import { Data } from "effect";

/** The transcript has no message with this uuid that a person could have sent. */
export class TranscriptMessageNotFound extends Data.TaggedError("TranscriptMessageNotFound")<{
  readonly session: string;
  readonly messageId: string;
}> {
  override get message() {
    return `Transcript session ${this.session} has no message ${this.messageId}. Take references from \`tastebud transcript-candidates\`.`;
  }
}

/** The message exists but mining's rule doesn't count it as the owner's own typing. */
export class TranscriptMessageIneligible extends Data.TaggedError("TranscriptMessageIneligible")<{
  readonly session: string;
  readonly messageId: string;
  readonly problem: string;
}> {
  override get message() {
    return `Message ${this.messageId} in transcript session ${this.session} isn't words the owner typed: ${this.problem}.`;
  }
}
