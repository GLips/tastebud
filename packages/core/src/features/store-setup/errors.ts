import { Data } from "effect";

/** `taste init` (or seed) on a root that already holds a store. */
export class StoreAlreadyExists extends Data.TaggedError("StoreAlreadyExists")<{
  readonly root: string;
}> {
  override get message() {
    return `A Taste store already exists at ${this.root}.`;
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
