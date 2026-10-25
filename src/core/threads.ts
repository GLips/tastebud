/**
 * Review threads: one append-only entry per comment on a derivation. Agents reply as themselves;
 * only the review server (and the seed) write the owner's notes, which wake listeners.
 */
import { Effect, Schema } from "effect";

import { TrimmedText } from "../shared/input-text.ts";
import { requireAgentActor, type TasteCaller } from "./caller.ts";
import { InvalidTasteInput } from "./errors.ts";
import { formatLocalIsoTime, newRecordId } from "./ids.ts";
import { SCHEMA_VERSION, type ThreadEntryRecord } from "./records.ts";
import { resolveDerivationRef, TasteStore } from "./store.ts";

export const ThreadEntryInput = Schema.Struct({
  derivation: TrimmedText.annotate({ description: "The derivation whose thread this joins" }),
  text: TrimmedText,
});
export type ThreadEntryInput = typeof ThreadEntryInput.Type;

/** The command an agent runs to answer a note. The listener prints it, so it is spelled here once. */
export const threadReplyInstruction = (derivationId: string, agent: string): string =>
  `taste thread reply ${derivationId} --as ${agent} "…"`;

const appendThreadEntry = Effect.fn("taste.appendThreadEntry")(function* (input: ThreadEntryInput, author: string) {
  const store = yield* TasteStore;
  if (input.text === "") return yield* new InvalidTasteInput({ problems: ["text: a thread entry needs words"] });
  const derivation = yield* resolveDerivationRef(yield* store.snapshot, input.derivation);
  const entry: ThreadEntryRecord = {
    id: newRecordId(),
    type: "ThreadEntry",
    schema_version: SCHEMA_VERSION,
    thread: derivation.id,
    author,
    at: formatLocalIsoTime(new Date()),
    text: input.text,
  };
  yield* store.write(entry);
  return { entry };
});

/** `thread-reply`: an agent answering on a thread, as the caller's actor. */
export const appendAgentThreadReply = Effect.fn("taste.appendAgentThreadReply")(function* (
  input: ThreadEntryInput,
  caller: TasteCaller,
) {
  const agent = yield* requireAgentActor(caller, "thread-reply");
  return yield* appendThreadEntry(input, agent);
});

/** `thread-note`: the owner's comment, from the review UI (or the seed, on their behalf). */
export const appendOwnerThreadNote = Effect.fn("taste.appendOwnerThreadNote")(function* (input: ThreadEntryInput) {
  const store = yield* TasteStore;
  return yield* appendThreadEntry(input, store.config.owner);
});
