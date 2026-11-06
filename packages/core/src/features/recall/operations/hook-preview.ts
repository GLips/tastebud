import { Effect, Schema } from "effect";

import { TranscriptReadingSchema } from "#core/domains/hook-evidence/index.ts";
import type { TasteCaller } from "#core/domains/taste-caller/index.ts";
import { resolveOperationContext } from "#core/features/place-context/index.server.ts";
import { OptionalTrimmedText, OptionalTrimmedTextList } from "#core/shared/input-text.ts";

import { buildHookPayload } from "./build-hook-payload.ts";

export const HookPreviewInput = Schema.Struct({
  prompt: Schema.String.annotate({ description: "The prompt the hook would see" }),
  in: OptionalTrimmedText.annotate({ description: "Preview as if in this directory" }),
  at: OptionalTrimmedTextList.annotate({ description: "Preview as if at these places" }),
  transcript: Schema.optionalKey(TranscriptReadingSchema).annotate({
    description: "The previous turn and recent hook output, as a host transcript decoder read them",
  }),
});
export type HookPreviewInput = typeof HookPreviewInput.Type;

/** `hook-preview`: the exact payload the prompt hook would inject for this prompt and context. Reads only. */
export const previewHookPayload = Effect.fn("recall.previewHookPayload")(function* (
  input: HookPreviewInput,
  caller: TasteCaller,
) {
  const context = yield* resolveOperationContext(input, caller);
  return yield* buildHookPayload({ prompt: input.prompt, context, transcript: input.transcript });
});
