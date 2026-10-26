import { Effect } from "effect";

import { requireAgentActor, type TasteCaller } from "#core/domains/taste-caller/index.ts";

import { appendThreadEntry, type ThreadEntryInput } from "./thread-entry.ts";

/** `thread-reply`: an agent answering on a thread, as the caller's actor. */
export const appendAgentThreadReply = Effect.fn("review-threads.appendAgentThreadReply")(function* (
  input: ThreadEntryInput,
  caller: TasteCaller,
) {
  const agent = yield* requireAgentActor(caller, "thread-reply");
  return yield* appendThreadEntry(input, agent);
});
