/**
 * The decisions made in this browser tab, newest first, each its own line: an accept and the undo
 * that put it back are two entries, as they are two records. Kept in sessionStorage so it survives
 * moving between screens and a reload.
 */
import { DerivationScopeSchema } from "@tastebud/core/places";
import { DecisionOutcomeSchema } from "@tastebud/core/taste-vocabulary";
import { Option, Schema } from "effect";
import { useSyncExternalStore } from "react";

import { readTabSessionText, writeTabSessionText } from "#review/infrastructure/browser-storage.ts";

const ReviewSessionDecisionSchema = Schema.Struct({
  decisionId: Schema.String,
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

const STORAGE_KEY = "tastebud.review.session";
const listeners = new Set<() => void>();
let cached: ReadonlyArray<ReviewSessionDecision> | undefined;

const readStored = (): ReadonlyArray<ReviewSessionDecision> => {
  if (cached !== undefined) return cached;
  const stored = readTabSessionText(STORAGE_KEY);
  cached = stored === undefined ? [] : Option.getOrElse(decodeStoredSession(stored), () => []);
  return cached;
};

export const recordSessionDecision = (decision: ReviewSessionDecision): void => {
  cached = [decision, ...readStored()];
  writeTabSessionText(STORAGE_KEY, JSON.stringify(cached));
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const EMPTY: ReadonlyArray<ReviewSessionDecision> = [];

export const useReviewSessionLog = (): ReadonlyArray<ReviewSessionDecision> =>
  useSyncExternalStore(subscribe, readStored, () => EMPTY);
