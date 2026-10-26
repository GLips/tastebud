/**
 * The four record types at schema "2". These schemas check files as they are read and records before
 * they are written. Every value is a string or a list of strings, because frontmatter is read with
 * YAML's failsafe schema and nothing is coerced.
 */
import { Result, Schema } from "effect";

import { canonicalPlaceKey, type DerivationScope } from "#core/domains/places/index.ts";
import { DecisionOutcomeSchema, SAID_AT_PRECISIONS, SCOPE_SOURCES } from "#core/domains/taste-vocabulary/index.ts";

export const SCHEMA_VERSION = "2";

/** ISO 8601 with an explicit offset; seconds and fractions optional (minute precision has none). */
const ISO_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Kind keys name folders of meaning, not paths: lowercase, digits and dashes. */
export const KIND_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;

const NonEmpty = Schema.String.check(Schema.isMinLength(1));
const IsoTime = Schema.String.check(
  Schema.isPattern(ISO_TIME_PATTERN, { message: "expected ISO 8601 with an offset" }),
);
const KindKey = Schema.String.check(Schema.isPattern(KIND_KEY_PATTERN, { message: "expected a kind key" }));
/** `<service>:<id>`, e.g. `slack:acme/U123` or `human:demo`. `claude-code/2.x` is an actor, not an account. */
const AccountSchema = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9-]*:\S+$/, { message: "expected <service>:<id>" }),
);
export const HumanAccountSchema = Schema.String.check(
  Schema.isPattern(/^human:\S+$/, { message: "expected human:<id>" }),
);
/** Agents and processes, e.g. `claude-code/2.x`, `process:seed`. Never `human:`. */
const ActorSchema = Schema.String.check(
  Schema.isPattern(/^(?!human:)\S+$/, { message: "expected an agent or process actor, never human:<id>" }),
);
const Ids = Schema.Array(NonEmpty);
/** A hand-edited file could hold any spelling; matching assumes canonical keys, so others are refused. */
const CanonicalPlaceKey = Schema.String.check(
  Schema.makeFilter((key: string) => {
    const canonical = canonicalPlaceKey(key);
    if (Result.isFailure(canonical)) return canonical.failure;
    return canonical.success === key ? undefined : `expected the canonical spelling ${canonical.success}`;
  }),
);
const Places = Schema.Array(CanonicalPlaceKey);

const recordBase = {
  id: NonEmpty,
  schema_version: Schema.Literal(SCHEMA_VERSION),
};

/** `places` is present exactly when `scope` is `places`, and then non-empty. */
const scopeFieldsAgree = (record: {
  readonly scope?: "global" | "places" | undefined;
  readonly places?: ReadonlyArray<string> | undefined;
}) => {
  if (record.scope === "places" && (record.places === undefined || record.places.length === 0))
    return { path: ["places"], issue: "places is required and non-empty when scope is places" };
  if (record.scope !== "places" && record.places !== undefined)
    return { path: ["places"], issue: "places is only allowed when scope is places" };
  return undefined;
};

export const SourceRecordSchema = Schema.Struct({
  ...recordBase,
  type: Schema.Literal("Source"),
  kind: KindKey,
  said_by: AccountSchema,
  said_by_label: NonEmpty,
  said_at: IsoTime,
  said_at_precision: Schema.Literals(SAID_AT_PRECISIONS),
  captured_at: IsoTime,
  captured_via: ActorSchema,
  address: Schema.optionalKey(NonEmpty),
  /** Provenance only: where the capture happened. It never filters and never scopes anything. */
  captured_in: Schema.optionalKey(Places),
  revises: Schema.optionalKey(NonEmpty),
  // Body: `## Quote`, then optional `## Before` / `## After`.
  quote: NonEmpty,
  before: Schema.optionalKey(NonEmpty),
  after: Schema.optionalKey(NonEmpty),
});
export type SourceRecord = typeof SourceRecordSchema.Type;

export const DerivationRecordSchema = Schema.Struct({
  ...recordBase,
  type: Schema.Literal("Derivation"),
  kind: KindKey,
  statement: NonEmpty.check(Schema.isPattern(/^[^\n]+$/, { message: "statement must be one line" })),
  scope: Schema.Literals(["global", "places"]),
  places: Schema.optionalKey(Places),
  scope_source: Schema.Literals(SCOPE_SOURCES),
  subject: Schema.optionalKey(
    Schema.String.check(
      Schema.isPattern(/^(owner|[a-z][a-z0-9-]*:\S+)$/, { message: "expected owner or a said_by account" }),
    ),
  ),
  supports: Ids.check(Schema.isMinLength(1)),
  contradicts: Schema.optionalKey(Ids),
  supersedes: Schema.optionalKey(NonEmpty),
  despite: Schema.optionalKey(Ids),
  proposed_by: ActorSchema,
  proposed_at: IsoTime,
  // Body: the reasoning, then `## Despite` holding the agent's case when `despite` is set.
  reasoning: Schema.String,
  despite_case: Schema.optionalKey(NonEmpty),
}).check(Schema.makeFilter(scopeFieldsAgree));
export type DerivationRecord = typeof DerivationRecordSchema.Type;

export const DecisionRecordSchema = Schema.Struct({
  ...recordBase,
  type: Schema.Literal("Decision"),
  target: NonEmpty,
  outcome: DecisionOutcomeSchema,
  by: HumanAccountSchema,
  at: IsoTime,
  reason: Schema.optionalKey(NonEmpty),
  /** Accept only: "accepted, with this scope". The effective scope from then on. */
  scope: Schema.optionalKey(Schema.Literals(["global", "places"])),
  places: Schema.optionalKey(Places),
  /** Accept only: blocking matches the human saw and accepted anyway. */
  acknowledges: Schema.optionalKey(Ids),
  /** The process that wrote on the human's behalf, e.g. the seed. */
  via: Schema.optionalKey(ActorSchema),
}).check(
  Schema.makeFilter(scopeFieldsAgree),
  Schema.makeFilter((record) =>
    record.outcome !== "accept" && (record.scope !== undefined || record.acknowledges !== undefined)
      ? { path: ["outcome"], issue: "only an accept may carry scope or acknowledges" }
      : undefined,
  ),
  Schema.makeFilter((record) =>
    record.outcome === "reject" && record.reason === undefined
      ? { path: ["reason"], issue: "a rejection needs a reason" }
      : undefined,
  ),
);
export type DecisionRecord = typeof DecisionRecordSchema.Type;

export const ThreadEntryRecordSchema = Schema.Struct({
  ...recordBase,
  type: Schema.Literal("ThreadEntry"),
  thread: NonEmpty,
  author: Schema.String.check(Schema.isPattern(/^\S+$/, { message: "expected an actor or human:<id>" })),
  at: IsoTime,
  text: NonEmpty,
});
export type ThreadEntryRecord = typeof ThreadEntryRecordSchema.Type;

export const TasteRecordSchema = Schema.Union([
  SourceRecordSchema,
  DerivationRecordSchema,
  DecisionRecordSchema,
  ThreadEntryRecordSchema,
]);
export type TasteRecord = typeof TasteRecordSchema.Type;

/** A derivation's proposed scope, read off its frontmatter. */
export const proposedScopeOf = (derivation: DerivationRecord) => scopeFromFields(derivation);

/** A scope from `scope`/`places` fields the record schema already checked agree. */
export const scopeFromFields = (fields: {
  readonly scope: "global" | "places";
  readonly places?: ReadonlyArray<string>;
}): DerivationScope =>
  fields.scope === "places" ? { scope: "places", places: fields.places ?? [] } : { scope: "global" };

/** The time a record's file is laid out (and sorted) by. */
export const recordCreatedAt = (record: TasteRecord): string => {
  switch (record.type) {
    case "Source":
      return record.captured_at;
    case "Derivation":
      return record.proposed_at;
    case "Decision":
    case "ThreadEntry":
      return record.at;
  }
};
