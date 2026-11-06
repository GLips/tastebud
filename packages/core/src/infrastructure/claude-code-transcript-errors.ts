/** Failures reaching Claude Code's transcripts under `CLAUDE_CONFIG_DIR`. */
import { Data } from "effect";

/**
 * A transcript reference that names no transcript inside the transcript root: a malformed session,
 * none by that id, or a file whose real path escapes the root through a symlink.
 */
export class TranscriptReferenceUnresolved extends Data.TaggedError("TranscriptReferenceUnresolved")<{
  readonly session: string;
  readonly problem: string;
}> {
  override get message() {
    return `Transcript session ${JSON.stringify(this.session)} can't be used: ${this.problem}.`;
  }
}

/** A transcript, or the directory listing them, exists but couldn't be read. */
export class TranscriptReadFailed extends Data.TaggedError("TranscriptReadFailed")<{
  readonly path: string;
  readonly problem: string;
}> {
  override get message() {
    return `Could not read the Claude Code transcript at ${this.path}: ${this.problem}`;
  }
}
