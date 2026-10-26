import { Data } from "effect";

/** Caller-supplied input failed validation, at decode time or against the store. */
export class InvalidTasteInput extends Data.TaggedError("InvalidTasteInput")<{
  readonly problems: ReadonlyArray<string>;
}> {
  override get message() {
    return `Invalid input: ${this.problems.join("; ")}.`;
  }
}
