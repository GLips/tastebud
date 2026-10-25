/**
 * The shapes operations return. Each is a Schema, so an operation's `output` describes exactly what
 * the CLI prints under `--json`, what MCP returns as structured content, and what the UI reads.
 * Absent values are absent keys, never `undefined`, so every result is plain JSON.
 */
import { Schema } from "effect";

import { DerivationScopeSchema, TasteContextSchema } from "../shared/places.ts";
import { DerivationStatusSchema, RecallPolicySchema, SCOPE_SOURCES } from "../shared/vocabulary.ts";
import {
  DecisionRecordSchema,
  DerivationRecordSchema,
  SourceRecordSchema,
  TasteRecordSchema,
  ThreadEntryRecordSchema,
} from "./records.ts";

/**
 * The one projection of a derivation plus its status. Every other derivation shape (recall hits,
 * hook items, repeat matches, full views) extends it, so a new derivation-level field is added once.
 */
export const DerivationSummarySchema = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  /** The kind's singular label; the bare key when the kind is retired. */
  kindLabel: Schema.String,
  /** The kind is no longer in the catalog: list and show only. */
  retired: Schema.Boolean,
  statement: Schema.String,
  status: DerivationStatusSchema,
  proposedScope: DerivationScopeSchema,
  /** What recall, the repeat check, grouping and the audit use. */
  effectiveScope: DerivationScopeSchema,
  scopeSource: Schema.Literals(SCOPE_SOURCES),
  subject: Schema.optionalKey(Schema.String),
  proposedAt: Schema.String,
  /** When the decision behind the current status was made; absent while pending. */
  decidedAt: Schema.optionalKey(Schema.String),
  /** That decision's reason (always present for a rejection). */
  reason: Schema.optionalKey(Schema.String),
});
export type DerivationSummary = typeof DerivationSummarySchema.Type;

/** A derivation compared with a candidate statement by the repeat check. */
export const RepeatMatchSchema = Schema.Struct({
  ...DerivationSummarySchema.fields,
  /** Normalised token Jaccard against the candidate statement. */
  similarity: Schema.Finite,
});
export type RepeatMatch = typeof RepeatMatchSchema.Type;

/** A source as recall and views show it, with its kind's label. */
export const SourceViewSchema = Schema.Struct({
  source: SourceRecordSchema,
  kindLabel: Schema.String,
  retired: Schema.Boolean,
});
export type SourceView = typeof SourceViewSchema.Type;

/** Why a recalled derivation is here: its kind's policy, its status, the place that matched, its score. */
export const RecallExplanationSchema = Schema.Struct({
  policy: RecallPolicySchema,
  status: DerivationStatusSchema,
  /** The scope place that covered a context place, or `global`. */
  matchedPlace: Schema.String,
  /** Text relevance, higher is better; 0 where nothing was searched (context). */
  score: Schema.Finite,
});

const RecallHitSchema = Schema.Struct({
  ...DerivationSummarySchema.fields,
  explanation: RecallExplanationSchema,
  /** The sources it directly cites in `supports`. */
  sources: Schema.Array(SourceViewSchema),
});
export type RecallHit = typeof RecallHitSchema.Type;

const RECALL_EXCLUSION_REASONS = [
  "out-of-scope",
  "never-policy",
  "pending",
  "history-not-requested",
  "kind-not-selected",
  "retired-kind",
] as const;
export type RecallExclusionReason = (typeof RECALL_EXCLUSION_REASONS)[number];

/** A close text match that recall left out, and why. */
const ExcludedRecallHitSchema = Schema.Struct({
  ...DerivationSummarySchema.fields,
  exclusion: Schema.Literals(RECALL_EXCLUSION_REASONS),
  score: Schema.Finite,
});
export type ExcludedRecallHit = typeof ExcludedRecallHitSchema.Type;

const SourceHitSchema = Schema.Struct({ ...SourceViewSchema.fields, score: Schema.Finite });
export type SourceHit = typeof SourceHitSchema.Type;

export const RecallResultSchema = Schema.Struct({
  query: Schema.String,
  context: TasteContextSchema,
  /** The derived kinds searched. */
  kinds: Schema.Array(Schema.String),
  /** Accepted and eligible, best match first. */
  accepted: Schema.Array(RecallHitSchema),
  /** Rejected and eligible: shown as not accepted, never turned into an opposite. */
  rejected: Schema.Array(RecallHitSchema),
  /** Raw sources matching the text. Store-wide: sources never carry scope. */
  sources: Schema.Array(SourceHitSchema),
  /** Superseded and retracted matches; empty unless history was asked for. */
  history: Schema.Array(RecallHitSchema),
  excluded: Schema.Array(ExcludedRecallHitSchema),
});
export type RecallResult = typeof RecallResultSchema.Type;

export const ContextResultSchema = Schema.Struct({
  context: TasteContextSchema,
  kinds: Schema.Array(Schema.String),
  /** Every accepted, eligible derivation of those kinds, oldest first. */
  derivations: Schema.Array(RecallHitSchema),
});
export type ContextResult = typeof ContextResultSchema.Type;

export const DerivationViewSchema = Schema.Struct({
  ...DerivationSummarySchema.fields,
  derivation: DerivationRecordSchema,
  /** Oldest first, including decisions that had no effect. */
  decisions: Schema.Array(DecisionRecordSchema),
  supportingSources: Schema.Array(SourceViewSchema),
  supportingDerivations: Schema.Array(DerivationSummarySchema),
  contradictingSources: Schema.Array(SourceViewSchema),
  contradictingDerivations: Schema.Array(DerivationSummarySchema),
  supersedes: Schema.optionalKey(DerivationSummarySchema),
  /** The whole `supersedes` chain back from this derivation, oldest first; ends with `supersedes`. */
  ancestors: Schema.Array(DerivationSummarySchema),
  /** Every derivation naming this one in `supersedes`, whatever its status. */
  revisions: Schema.Array(DerivationSummarySchema),
  despite: Schema.Array(DerivationSummarySchema),
  thread: Schema.Array(ThreadEntryRecordSchema),
});
export type DerivationView = typeof DerivationViewSchema.Type;

export const ShowResultSchema = Schema.Struct({
  record: TasteRecordSchema,
  path: Schema.String,
  /** Present when the record is a derivation. */
  derivation: Schema.optionalKey(DerivationViewSchema),
  /** Present when the record is a source. */
  source: Schema.optionalKey(SourceViewSchema),
  /** Derivations citing this record in `supports` or `contradicts`. */
  citedBy: Schema.Array(DerivationSummarySchema),
  /** Sources whose `revises` names this one. */
  revisedBy: Schema.Array(SourceRecordSchema),
  /** Derivations proposed `despite` this one. */
  despitedBy: Schema.Array(DerivationSummarySchema),
  /** Accept decisions that acknowledged this one as a near repeat. */
  acknowledgedBy: Schema.Array(DerivationSummarySchema),
});
export type ShowResult = typeof ShowResultSchema.Type;
