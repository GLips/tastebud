/**
 * Raised both by the record decoder (a domain) and by the frontmatter codec (infrastructure), so it
 * sits below both, as one tag.
 */
import { Data } from "effect";

/** A file in the store does not parse as a record. Hand edits are the usual cause. */
export class CorruptRecordFile extends Data.TaggedError("CorruptRecordFile")<{
  readonly path: string;
  readonly problem: string;
}> {
  override get message() {
    return `Unreadable record file ${this.path}: ${this.problem}`;
  }
}
