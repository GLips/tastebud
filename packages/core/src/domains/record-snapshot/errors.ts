import { Data } from "effect";

/** An id, short id or id prefix that names no record of the expected type. */
export class UnknownRecordRef extends Data.TaggedError("UnknownRecordRef")<{
  readonly ref: string;
  readonly expected: string;
}> {
  override get message() {
    return `No ${this.expected} matches "${this.ref}".`;
  }
}

/** A short id or prefix that matches more than one record. */
export class AmbiguousRecordRef extends Data.TaggedError("AmbiguousRecordRef")<{
  readonly ref: string;
  readonly candidates: ReadonlyArray<string>;
}> {
  override get message() {
    return `"${this.ref}" matches several records: ${this.candidates.join(", ")}.`;
  }
}
