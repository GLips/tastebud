/**
 * The decisions made in this browser tab, kept in sessionStorage so they survive moving between screens
 * and a reload. Every record is logged, but the session is read net: one line per derivation whose
 * standing it changed, so a decision and its undo cancel out.
 */
import { DerivationScopeSchema } from "@tastebud/core/places";
import { DerivationStatusSchema } from "@tastebud/core/taste-vocabulary";
import { Option, Schema } from "effect";
import { useMemo, useSyncExternalStore } from "react";

import { readTabSessionText, writeTabSessionText } from "#review/infrastructure/browser-storage.ts";

const ReviewSessionDecisionSchema = Schema.Struct({
  decisionId: Schema.String,
  derivationId: Schema.String,
  kind: Schema.String,
  statement: Schema.String,
  /** Where it stood when decided; null when the deciding screen didn't know. */
  from: Schema.NullOr(DerivationStatusSchema),
  /** Where the decision left it. */
  status: DerivationStatusSchema,
  /** A reject on one already rejected: the reason on record was replaced. */
  reasonChanged: Schema.Boolean,
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

/**
 * The log read net, newest first: one line per derivation, dropped when it ends where it began and no
 * reason was replaced along the way.
 */
const netSessionDecisions = (log: ReadonlyArray<ReviewSessionDecision>): ReadonlyArray<ReviewSessionDecision> => {
  const byDerivation = new Map<string, Array<ReviewSessionDecision>>();
  for (const entry of log)
    byDerivation.set(entry.derivationId, [...(byDerivation.get(entry.derivationId) ?? []), entry]);
  return [...byDerivation.values()].flatMap((entries) => {
    const [newest] = entries;
    const oldest = entries.at(-1);
    if (newest === undefined || oldest === undefined) return [];
    const unchanged = oldest.from === newest.status && !entries.some((entry) => entry.reasonChanged);
    return unchanged ? [] : [newest];
  });
};

export const useNetReviewSession = (): ReadonlyArray<ReviewSessionDecision> => {
  const log = useSyncExternalStore(subscribe, readStored, () => EMPTY);
  return useMemo(() => netSessionDecisions(log), [log]);
};
