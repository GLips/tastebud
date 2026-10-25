/** `review-url`: a link into the review UI, so an agent can hand the human the page to decide on. */
import { Effect, Schema } from "effect";

import { OptionalTrimmedText } from "../shared/input-text.ts";
import { resolveAnyRecordRef, TasteStore } from "./store.ts";

/** Where `taste review` serves the UI; `TASTE_REVIEW_URL` overrides it for a non-default port or host. */
const DEFAULT_REVIEW_URL = "http://localhost:4747";

export const ReviewUrlInput = Schema.Struct({
  ref: OptionalTrimmedText.annotate({ description: "A record to link to; omit for the inbox" }),
});
export type ReviewUrlInput = typeof ReviewUrlInput.Type;

export const ReviewUrlResultSchema = Schema.Struct({ url: Schema.String });

const reviewBaseUrl = () => (process.env.TASTE_REVIEW_URL || DEFAULT_REVIEW_URL).replace(/\/+$/, "");

/** Decisions and thread entries link to the derivation they belong to. */
export const buildReviewUrl = Effect.fn("taste.buildReviewUrl")(function* (input: ReviewUrlInput) {
  const base = reviewBaseUrl();
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
