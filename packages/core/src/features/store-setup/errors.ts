import { Data } from "effect";

/**
 * `config-write` against a file other than the one the caller last read: someone edited it, or a
 * store exists where the caller expected none. `currentHash` is undefined when there is no file.
 */
export class StaleTastebudConfig extends Data.TaggedError("StaleTastebudConfig")<{
  readonly path: string;
  readonly currentHash: string | undefined;
  readonly expectedNoFile: boolean;
}> {
  override get message() {
    if (this.currentHash === undefined)
      return `There is no ${this.path} yet. To create the store, pass an empty expected_current.`;
    if (this.expectedNoFile)
      return `A store already exists here: ${this.path} (hash ${this.currentHash}). Read it with config-show and pass its hash as expected_current to change it.`;
    return `${this.path} is not the file you last read (it is now ${this.currentHash}). Read it again with config-show, redo the edit on that text, and show the owner the new diff.`;
  }
}

/** Seeding needs a store with no records yet. */
export class StoreNotEmpty extends Data.TaggedError("StoreNotEmpty")<{
  readonly root: string;
  readonly recordCount: number;
}> {
  override get message() {
    return `The store at ${this.root} already holds ${this.recordCount} records; seeding needs an empty store.`;
  }
}
