/**
 * Review threads: one append-only entry per comment on a derivation. Agents reply as themselves;
 * only the review server (and the seed) write the owner's notes, which wake listeners.
 */
import { Effect, Schema } from "effect";

import { resolveDerivationRef } from "#core/domains/record-snapshot/index.ts";
import { SCHEMA_VERSION, type ThreadEntryRecord } from "#core/domains/records/index.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { stampNewRecord } from "#core/infrastructure/record-ids.ts";
import { TrimmedText } from "#core/shared/input-text.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

export const ThreadEntryInput = Schema.Struct({
  ref: TrimmedText.annotate({ description: "The derivation whose thread this joins" }),
  text: TrimmedText,
});
export type ThreadEntryInput = typeof ThreadEntryInput.Type;

/** How an agent answers a note. The listener prints it, so it is spelled here once. */
export const threadReplyInstruction = (derivationId: string, agent: string): string =>
  `tastebud thread-reply ${derivationId} "…" --by ${agent}`;

/** Appends one entry by `author` to the thread of the derivation `input.ref` names. */
export const appendThreadEntry = Effect.fn("review-threads.appendThreadEntry")(function* (
  input: ThreadEntryInput,
  author: string,
) {
  const store = yield* TasteStore;
  if (input.text === "") return yield* new InvalidTasteInput({ problems: ["text: a thread entry needs words"] });
  const derivation = yield* resolveDerivationRef(yield* store.snapshot, input.ref);
  const stamp = yield* stampNewRecord;
  const entry: ThreadEntryRecord = {
    id: stamp.id,
    type: "ThreadEntry",
    schema_version: SCHEMA_VERSION,
    thread: derivation.id,
    author,
    at: stamp.at,
    text: input.text,
  };
  yield* store.write(entry);
  return { entry };
});
