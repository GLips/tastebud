/**
 * The decisions made in this browser tab, newest first: recovery without a fake Undo. Decisions are
 * append-only, so the list links to each one instead of offering to take it back. Kept in
 * sessionStorage so it survives moving between screens and a reload.
 */
import { Option, Schema } from "effect";
import { useSyncExternalStore } from "react";

import { DerivationScopeSchema } from "../shared/places.ts";
import { DecisionOutcomeSchema } from "../shared/vocabulary.ts";

const ReviewSessionDecisionSchema = Schema.Struct({
  derivationId: Schema.String,
  kind: Schema.String,
  statement: Schema.String,
  outcome: DecisionOutcomeSchema,
  effectiveScope: DerivationScopeSchema,
  at: Schema.String,
});
export type ReviewSessionDecision = typeof ReviewSessionDecisionSchema.Type;

// sessionStorage is outside input: a log written by an older build decodes to empty, not a crash.
const decodeStoredSession = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(ReviewSessionDecisionSchema)),
);

const STORAGE_KEY = "taste.review.session";
const listeners = new Set<() => void>();
let cached: ReadonlyArray<ReviewSessionDecision> | undefined;

const readStored = (): ReadonlyArray<ReviewSessionDecision> => {
  if (cached !== undefined) return cached;
  const stored = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(STORAGE_KEY);
  cached = stored === null ? [] : Option.getOrElse(decodeStoredSession(stored), () => []);
  return cached;
};

export const recordSessionDecision = (decision: ReviewSessionDecision): void => {
  cached = [decision, ...readStored().filter((entry) => entry.derivationId !== decision.derivationId)];
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const EMPTY: ReadonlyArray<ReviewSessionDecision> = [];

export const useReviewSessionLog = (): ReadonlyArray<ReviewSessionDecision> =>
  useSyncExternalStore(subscribe, readStored, () => EMPTY);
