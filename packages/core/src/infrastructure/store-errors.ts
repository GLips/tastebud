/** Failures of the store's environment: its files, config module, git and the decision lock. */
import { Data } from "effect";

/** No `taste.config.ts` at the resolved root. */
export class StoreNotInitialised extends Data.TaggedError("StoreNotInitialised")<{
  readonly root: string;
}> {
  override get message() {
    return `No Taste store at ${this.root}. Run \`taste init\` or \`taste seed\`, or pass --store / set TASTE_STORE.`;
  }
}

/** `taste.config.ts` failed to load or validate. Each problem names its field. */
export class InvalidConfig extends Data.TaggedError("InvalidConfig")<{
  readonly path: string;
  readonly problems: ReadonlyArray<string>;
}> {
  override get message() {
    return `${this.path} is invalid: ${this.problems.join("; ")}.`;
  }
}

/** A filesystem write failed, including an exclusive create hitting an existing path. */
export class StoreWriteFailed extends Data.TaggedError("StoreWriteFailed")<{
  readonly path: string;
  readonly problem: string;
}> {
  override get message() {
    return `Write failed at ${this.path}: ${this.problem}`;
  }
}

/** Another process held `.index/decide.lock` for too long. */
export class DecisionLockTimeout extends Data.TaggedError("DecisionLockTimeout")<{
  readonly lockPath: string;
}> {
  override get message() {
    return `Another decision is being written (${this.lockPath} is held). Try again in a moment.`;
  }
}

/**
 * The resolver could not say where the caller is: git timed out, an origin was malformed, or a
 * custom resolver threw. Never a silent switch to another identity.
 */
export class PlaceResolutionFailed extends Data.TaggedError("PlaceResolutionFailed")<{
  readonly directory: string;
  readonly problem: string;
}> {
  override get message() {
    return `Could not resolve the place for ${this.directory}: ${this.problem}`;
  }
}
