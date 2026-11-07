/**
 * `catch-up-done`: the receipt for a finished stretch of a catch-up, written only once its proposals
 * are in. An origin read in full advances to `read_through`; sources weighed are recorded under each
 * citing kind's current policy. A retry of the same receipt returns the first.
 */
import { Clock, Effect, Schema } from "effect";

import { catchUpPolicyTagOf, latestOriginReadings } from "#core/domains/catch-up/index.ts";
import { requireDerivedKind, requireSourceKind, type TasteCatalog } from "#core/domains/kind-catalog/index.ts";
import { resolveSourceRef, type StoreSnapshot } from "#core/domains/record-snapshot/index.ts";
import { type CatchUpRecord, CatchUpRecordSchema, SCHEMA_VERSION } from "#core/domains/records/index.ts";
import { requireAgentActor, type TasteCaller } from "#core/domains/taste-caller/index.ts";
import { resolveOperationContext } from "#core/features/place-context/index.server.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { stampNewRecord } from "#core/infrastructure/record-ids.ts";
import { OptionalTrimmedText, OptionalTrimmedTextList, OptionalVerbatimText } from "#core/shared/input-text.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

export const RecordCatchUpInput = Schema.Struct({
  origin: OptionalTrimmedText.annotate({
    description:
      "The source kind whose words you read in full, up to read_through. Leave it out for one you couldn't reach",
  }),
  read_through: OptionalTrimmedText.annotate({
    description:
      "With origin: everything said up to this ISO time was read; for Claude Code sessions, the read_until catch-up gave",
  }),
  considered: OptionalTrimmedTextList.annotate({
    description: "Sources you finished weighing, whether or not a proposal came of them; not ones you deferred",
  }),
  considered_for: OptionalTrimmedTextList.annotate({
    description:
      "With considered: the policy tag of each kind you weighed them for, as catch-up printed it, e.g. belief@f415f659",
  }),
  note: OptionalVerbatimText.annotate({ description: "One or two lines: what you proposed, or why nothing" }),
  in: OptionalTrimmedText.annotate({ description: "Where the catch-up ran" }),
});

export const RecordCatchUpResultSchema = Schema.Struct({
  catch_up: CatchUpRecordSchema,
  path: Schema.String,
  /** True when this same receipt was recorded before and is returned instead. */
  already_recorded: Schema.Boolean,
});

/** Allows for clocks a little apart; a reading can't be ahead of now by more. */
const CLOCK_SLACK_MS = 60_000;

const invalid = (problem: string) => new InvalidTasteInput({ problems: [problem] });

const sameIds = (left: ReadonlyArray<string> | undefined, right: ReadonlyArray<string> | undefined) =>
  (left ?? []).length === (right ?? []).length && (left ?? []).every((id) => (right ?? []).includes(id));

/** The origin reading the input claims, checked: a known source kind, an ISO time with offset, not ahead of now. */
const readingOf = Effect.fn("catch-up.readingOf")(function* (
  catalog: TasteCatalog,
  input: typeof RecordCatchUpInput.Type,
) {
  if ((input.origin === undefined) !== (input.read_through === undefined))
    return yield* invalid("origin and read_through go together");
  if (input.origin === undefined || input.read_through === undefined) return undefined;
  const kind = yield* requireSourceKind(catalog, input.origin);
  const throughMs = Date.parse(input.read_through);
  if (Number.isNaN(throughMs) || !/(Z|[+-]\d{2}:\d{2})$/.test(input.read_through))
    return yield* invalid(`read_through: expected an ISO time with an offset, got ${input.read_through}`);
  if (throughMs > (yield* Clock.currentTimeMillis) + CLOCK_SLACK_MS)
    return yield* invalid(`read_through: ${input.read_through} is in the future`);
  return { origin: kind.key, readThrough: input.read_through };
});

/**
 * The sources weighed, by full id, and the kinds they were weighed for. Each tag must be its kind's
 * current one: a prompt changed since `catch-up` printed it means the weighing followed an old prompt.
 */
const consideredOf = Effect.fn("catch-up.consideredOf")(function* (
  catalog: TasteCatalog,
  snapshot: StoreSnapshot,
  input: typeof RecordCatchUpInput.Type,
) {
  const refs = input.considered ?? [];
  const tags = [...new Set(input.considered_for ?? [])].toSorted();
  if ((refs.length === 0) !== (tags.length === 0)) return yield* invalid("considered and considered_for go together");
  const sources = [];
  for (const ref of refs) sources.push(yield* resolveSourceRef(snapshot, ref));
  for (const tag of tags) {
    const kind = yield* requireDerivedKind(catalog, tag.split("@")[0] ?? "");
    const current = catchUpPolicyTagOf(kind);
    if (tag !== current)
      return yield* invalid(
        `considered_for: ${kind.key}'s proposal policy is now ${current}, not ${tag}; run catch-up again and weigh under the current prompt`,
      );
    if (!sources.some((source) => kind.sources.includes(source.kind)))
      return yield* invalid(`considered_for: ${kind.key} cites none of these sources' kinds`);
  }
  return { considered: [...new Set(sources.map((source) => source.id))], consideredFor: tags };
});

export const recordCatchUp = Effect.fn("catch-up.recordCatchUp")(function* (
  input: typeof RecordCatchUpInput.Type,
  caller: TasteCaller,
) {
  const store = yield* TasteStore;
  const { catalog } = store.config;
  const by = yield* requireAgentActor(caller, "catch-up-done");
  const snapshot = yield* store.snapshot;
  if (input.origin === undefined && (input.considered ?? []).length === 0)
    return yield* invalid("give origin with read_through, considered sources, or both");
  const reading = yield* readingOf(catalog, input);
  const { considered, consideredFor } = yield* consideredOf(catalog, snapshot, input);

  const earlier = snapshot.records.find(
    ({ record }) =>
      record.type === "CatchUp" &&
      record.origin === reading?.origin &&
      (reading === undefined || Date.parse(record.read_through ?? "") === Date.parse(reading.readThrough)) &&
      sameIds(record.considered, considered.length > 0 ? considered : undefined) &&
      sameIds(record.considered_for, consideredFor.length > 0 ? consideredFor : undefined),
  );
  if (earlier?.record.type === "CatchUp")
    return { catch_up: earlier.record, path: earlier.path, already_recorded: true };
  if (reading !== undefined) {
    const latest = latestOriginReadings(snapshot.catchUps).get(reading.origin);
    if (
      latest !== undefined &&
      Date.parse(latest.readThrough) > Date.parse(reading.readThrough) &&
      considered.length === 0
    )
      return yield* invalid(`read_through: ${reading.origin} was already read through ${latest.readThrough}`);
  }

  const context = yield* resolveOperationContext(input, caller);
  const stamp = yield* stampNewRecord;
  const catchUp: CatchUpRecord = {
    id: stamp.id,
    type: "CatchUp",
    schema_version: SCHEMA_VERSION,
    by,
    at: stamp.at,
    ...(context.places.length > 0 && { run_in: context.places }),
    ...(reading !== undefined && { origin: reading.origin, read_through: reading.readThrough }),
    ...(considered.length > 0 && { considered, considered_for: consideredFor }),
    ...(input.note !== undefined && { note: input.note }),
  };
  const written = yield* store.write(catchUp);
  return { catch_up: catchUp, path: written.path, already_recorded: false };
});
