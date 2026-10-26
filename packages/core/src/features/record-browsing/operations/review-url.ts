/** `review-url`: a link into the review UI, so an agent can hand the human the page to decide on. */
import { Effect, Schema } from "effect";

import { resolveAnyRecordRef } from "#core/domains/record-snapshot/index.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { OptionalTrimmedText } from "#core/shared/input-text.ts";

/**
 * Where `taste review` serves the UI by default. Fixed, so links from `taste review --port N` for
 * any other N point at the default port: Taste reads no variable but `TASTE_STORE`.
 */
const REVIEW_BASE_URL = "http://localhost:4747";

export const ReviewUrlInput = Schema.Struct({
  ref: OptionalTrimmedText.annotate({ description: "A record to link to; omit for the inbox" }),
});
export type ReviewUrlInput = typeof ReviewUrlInput.Type;

export const ReviewUrlResultSchema = Schema.Struct({ url: Schema.String });

/** Decisions and thread entries link to the derivation they belong to. */
export const buildReviewUrl = Effect.fn("record-browsing.buildReviewUrl")(function* (input: ReviewUrlInput) {
  const base = REVIEW_BASE_URL;
  if (input.ref === undefined) return { url: `${base}/` };
  const store = yield* TasteStore;
  const { record } = yield* resolveAnyRecordRef(yield* store.snapshot, input.ref);
  switch (record.type) {
    case "Source":
      return { url: `${base}/sources/${record.id}` };
    case "Derivation":
      return { url: `${base}/derivations/${record.id}` };
    case "Decision":
      return { url: `${base}/derivations/${record.target}` };
    case "ThreadEntry":
      return { url: `${base}/derivations/${record.thread}` };
  }
});
