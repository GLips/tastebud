/** Failures of the store's environment: its files, config module, git and the decision lock. */
import { Data, Predicate } from "effect";

import { isArgumentSurface, type TasteSurface } from "#core/shared/taste-surface.ts";

/** A Node system error's `code` (`ENOENT`, `EEXIST`, …), read off a caught value. */
export const errorCodeOf = (cause: unknown): string | undefined =>
  Predicate.hasProperty(cause, "code") && Predicate.isString(cause.code) ? cause.code : undefined;

/** No `tastebud.config.ts` at the resolved root. The sentence sends an agent to setup, spelled for its surface. */
export class StoreNotInitialised extends Data.TaggedError("StoreNotInitialised")<{
  readonly root: string;
}> {
  sentenceFor(surface: TasteSurface) {
    const setup = isArgumentSurface(surface)
      ? "Set it up with the owner: call tastebud_config_show with guide: true and lead them through the interview it returns. To use a different store, the MCP server must be started with --store <dir>"
      : "Set it up with the owner: run `tastebud config-show --guide` and lead them through the interview it prints. To use a different store, pass --store or set TASTEBUD_STORE";
    return `No Tastebud store at ${this.root} yet. ${setup}.`;
  }
  override get message() {
    return this.sentenceFor("cli");
  }
}

/** `tastebud.config.ts` failed to load or validate. Each problem names its field. */
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

/** Another process held a store lock (`.index/decide.lock` or `.index/config.lock`) for too long. */
export class StoreLockTimeout extends Data.TaggedError("StoreLockTimeout")<{
  readonly lockPath: string;
  readonly name: "decide" | "config";
}> {
  override get message() {
    const writing = this.name === "decide" ? "decision" : "config write";
    return `Another ${writing} is in progress (${this.lockPath} is held). Try again in a moment.`;
  }
}

/** A store file exists but couldn't be read (permissions, a directory in its place). */
export class StoreReadFailed extends Data.TaggedError("StoreReadFailed")<{
  readonly path: string;
  readonly problem: string;
}> {
  override get message() {
    return `Could not read ${this.path}: ${this.problem}`;
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
