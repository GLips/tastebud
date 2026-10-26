import { Effect } from "effect";

import { TasteStore } from "#core/features/record-store/index.server.ts";

import { appendThreadEntry, type ThreadEntryInput } from "./thread-entry.ts";

/** `thread-note`: the owner's comment, from the review UI (or the seed, on their behalf). */
export const appendOwnerThreadNote = Effect.fn("review-threads.appendOwnerThreadNote")(function* (
  input: ThreadEntryInput,
) {
  const store = yield* TasteStore;
  return yield* appendThreadEntry(input, store.config.owner);
});
