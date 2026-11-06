/**
 * What the prompt hook knows besides the prompt, as any host can supply it: the turn before this
 * prompt and the derivations earlier hook runs sent, each with its age in owner turns. A host's
 * transcript decoder fills it in and applies no policy; relevance, scope, selection and the repeat
 * window read only this shape.
 */
import { Schema } from "effect";

/** The caps a decoder applies, so a long turn costs the hook a bounded search. */
export const PREVIOUS_TURN_LIMITS = {
  /** Characters of the assistant's visible prose, the latest kept. */
  proseChars: 4096,
  /** Touched files, modified before read. */
  touchedPaths: 12,
  /** Characters of text written by edits, the latest kept. */
  changedTextChars: 4096,
} as const;

const TouchedPathSchema = Schema.Struct({
  path: Schema.String,
  access: Schema.Literals(["modified", "read"]),
});
export type TouchedPath = typeof TouchedPathSchema.Type;

/** The turn the prompt answers: what the agent said and did, never tool output or reasoning. */
export const PreviousTurnEvidenceSchema = Schema.Struct({
  assistantProse: Schema.String.check(Schema.isMaxLength(PREVIOUS_TURN_LIMITS.proseChars)),
  touchedPaths: Schema.Array(TouchedPathSchema).check(Schema.isMaxLength(PREVIOUS_TURN_LIMITS.touchedPaths)),
  changedText: Schema.String.check(Schema.isMaxLength(PREVIOUS_TURN_LIMITS.changedTextChars)),
});
export type PreviousTurnEvidence = typeof PreviousTurnEvidenceSchema.Type;

/** One derivation an earlier hook run sent, with the state it was sent in. */
export const HookEmissionSchema = Schema.Struct({ id: Schema.String, fingerprint: Schema.String });
export type HookEmission = typeof HookEmissionSchema.Type;

/**
 * An emission as found in the host's record, with how many owner messages came after it: 0 for
 * output sent on the latest owner message before this prompt.
 */
export const RecordedHookEmissionSchema = Schema.Struct({
  ...HookEmissionSchema.fields,
  ownerTurnsAgo: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type RecordedHookEmission = typeof RecordedHookEmissionSchema.Type;

/**
 * A host transcript as the hook read it. `unavailable` means there was one but it couldn't be
 * read, so the hook falls back to the prompt alone. An empty `earlierEmissions` suppresses nothing,
 * which is also what a transcript in an unfamiliar format yields.
 */
export const TranscriptReadingSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("read"),
    previousTurn: Schema.optionalKey(PreviousTurnEvidenceSchema),
    earlierEmissions: Schema.Array(RecordedHookEmissionSchema),
  }),
  Schema.Struct({ status: Schema.Literal("unavailable") }),
]);
export type TranscriptReading = typeof TranscriptReadingSchema.Type;
