/**
 * `capture`: append a source, a human's exact words, whitespace included. The agent is only
 * `captured_via`. It needs nothing looked up first: the kind defaults to the config's conversation
 * kind, and `said_by: "owner"` names the configured owner. Given a transcript reference, the words
 * are checked against that Claude Code message, which also supplies who, when and where.
 */
import { Effect, Schema } from "effect";

import { requireSourceKind, type TasteCatalog } from "#core/domains/kind-catalog/index.ts";
import { resolveSourceRef } from "#core/domains/record-snapshot/index.ts";
import { SourceViewSchema, viewSource } from "#core/domains/record-views/index.ts";
import { SCHEMA_VERSION, type SourceRecord } from "#core/domains/records/index.ts";
import type { LoadedTastebudConfig } from "#core/domains/store-config/index.ts";
import { requireAgentActor, type TasteCaller } from "#core/domains/taste-caller/index.ts";
import { OWNER_SUBJECT, SAID_AT_PRECISIONS, type SaidAtPrecision } from "#core/domains/taste-vocabulary/index.ts";
import { resolveOperationContext } from "#core/features/place-context/index.server.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { TranscriptReferenceSchema } from "#core/features/transcript-mining/index.server.ts";
import { stampNewRecord } from "#core/infrastructure/record-ids.ts";
import {
  optionalInputChoice,
  OptionalTrimmedText,
  OptionalTrimmedTextList,
  OptionalVerbatimText,
  VerbatimText,
} from "#core/shared/input-text.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

import { readTranscriptCapture } from "./transcript-capture.ts";

export const CaptureSourceInput = Schema.Struct({
  kind: OptionalTrimmedText.annotate({
    description: "Source kind; leave it out for words heard in this conversation",
  }),
  said_by: OptionalTrimmedText.annotate({
    description:
      'Who said it: "owner" for the owner, else their account, e.g. human:dana or slack:acme/U123. Required unless `transcript` is given',
  }),
  said_by_label: OptionalTrimmedText.annotate({
    description: "The speaker's display name; required for anyone but the owner",
  }),
  said_at: OptionalTrimmedText.annotate({ description: "ISO 8601 with offset; defaults to now" }),
  said_at_precision: optionalInputChoice(SAID_AT_PRECISIONS),
  quote: VerbatimText.annotate({ description: "Their exact words, verbatim; whitespace is kept" }),
  before: OptionalVerbatimText.annotate({ description: "What they were reacting to" }),
  after: OptionalVerbatimText,
  address: OptionalTrimmedText.annotate({ description: "A permalink to the words" }),
  revises: OptionalTrimmedText.annotate({ description: "A source of the same kind these words edit" }),
  in: OptionalTrimmedText.annotate({
    description: "Capture as if in this directory; ignored with `transcript`, whose message says where it was sent",
  }),
  at: OptionalTrimmedTextList.annotate({ description: "Capture as if at these places" }),
  transcript: Schema.optionalKey(TranscriptReferenceSchema).annotate({
    description:
      "The Claude Code message the quote comes from, as transcript-candidates lists it. The quote must be an exact stretch of one of its parts; speaker, time and place then come from the transcript, so leave out said_by, said_at, address and at. Capturing the same quote from a message again returns the first capture; another quote from it is a new source",
  }),
});
export type CaptureSourceInput = typeof CaptureSourceInput.Type;

export const CaptureResultSchema = Schema.Struct({
  source: SourceViewSchema,
  path: Schema.String,
  /** True when the same quote from the same transcript message was captured before and is returned instead. */
  already_captured: Schema.Boolean,
});

/** Minute precision when the time has no seconds; agents can say `day` explicitly. */
const inferPrecision = (saidAt: string): SaidAtPrecision => (/T\d{2}:\d{2}(Z|[+-])/.test(saidAt) ? "minute" : "second");

const chooseSourceKind = (catalog: TasteCatalog, kind: string | undefined) => {
  const chosen = kind ?? catalog.conversationSourceKind;
  if (chosen !== undefined) return requireSourceKind(catalog, chosen);
  return Effect.fail(
    new InvalidTasteInput({
      problems: [
        `kind is required: this store has several source kinds (${catalog.sourceKinds.map((known) => known.key).join(", ")}) and its config doesn't say which one words heard in conversation are. Ask the owner to set conversationSourceKind in tastebud.config.ts, once for every capture: \`tastebud config-show --guide\` walks the change, \`tastebud config-write\` saves it.`,
      ],
    }),
  );
};

/** `owner` is the configured owner; anyone else must be named by account and label. */
const resolveSpeaker = (config: LoadedTastebudConfig, input: CaptureSourceInput) => {
  if (input.said_by === undefined)
    return Effect.fail(
      new InvalidTasteInput({ problems: ['said_by: required, "owner" or an account, unless transcript is given'] }),
    );
  if (input.said_by === OWNER_SUBJECT)
    return Effect.succeed({ saidBy: config.owner, label: input.said_by_label ?? config.ownerName });
  if (input.said_by_label === undefined)
    return Effect.fail(
      new InvalidTasteInput({ problems: [`said_by_label: required for ${input.said_by}; only "owner" may omit it`] }),
    );
  return Effect.succeed({ saidBy: input.said_by, label: input.said_by_label });
};

/** Who, when and where, as the caller says: the speaker it names, the time it gives, the context it is in. */
const readCallerCapture = Effect.fn("capture.readCallerCapture")(function* (
  config: LoadedTastebudConfig,
  input: CaptureSourceInput,
  caller: TasteCaller,
  kind: string,
) {
  const speaker = yield* resolveSpeaker(config, input);
  const context = yield* resolveOperationContext(input, caller, {
    kind,
    ...(input.address !== undefined && { address: input.address }),
    saidBy: speaker.saidBy,
  });
  return {
    ...speaker,
    saidAt: input.said_at,
    precision: input.said_at_precision,
    address: input.address,
    places: context.places,
  };
});

export const captureSource = Effect.fn("capture.captureSource")(function* (
  input: CaptureSourceInput,
  caller: TasteCaller,
) {
  const store = yield* TasteStore;
  const kind = yield* chooseSourceKind(store.config.catalog, input.kind);
  const capturedVia = yield* requireAgentActor(caller, "capture");
  const snapshot = yield* store.snapshot;
  const view = (source: SourceRecord) => viewSource({ snapshot, catalog: store.config.catalog }, source);
  const said =
    input.transcript === undefined
      ? yield* readCallerCapture(store.config, input, caller, kind.key)
      : yield* readTranscriptCapture(store.config, input, input.transcript, caller, kind.key);
  // A transcript capture's address names its message, so the same words captured from it again find
  // the first. Other words from that message are a source of their own.
  const earlier =
    input.transcript === undefined
      ? undefined
      : snapshot.records.find(
          ({ record }) =>
            record.type === "Source" &&
            record.address === said.address &&
            record.quote === input.quote &&
            record.kind === kind.key,
        );
  if (earlier?.record.type === "Source")
    return { source: view(earlier.record), path: earlier.path, already_captured: true };
  const revised = input.revises === undefined ? undefined : yield* resolveSourceRef(snapshot, input.revises);
  if (revised !== undefined && revised.kind !== kind.key)
    return yield* new InvalidTasteInput({
      problems: [`revises: ${revised.id} is a ${revised.kind}, not a ${kind.key}`],
    });
  const stamp = yield* stampNewRecord;
  const now = stamp.at;
  const saidAt = said.saidAt ?? now;
  const source: SourceRecord = {
    id: stamp.id,
    type: "Source",
    schema_version: SCHEMA_VERSION,
    kind: kind.key,
    said_by: said.saidBy,
    said_by_label: said.label,
    said_at: saidAt,
    said_at_precision: said.precision ?? inferPrecision(saidAt),
    captured_at: now,
    captured_via: capturedVia,
    ...(said.address !== undefined && { address: said.address }),
    ...(said.places.length > 0 && { captured_in: said.places }),
    ...(revised !== undefined && { revises: revised.id }),
    quote: input.quote,
    ...(input.before !== undefined && { before: input.before }),
    ...(input.after !== undefined && { after: input.after }),
  };
  const written = yield* store.write(source);
  return { source: view(source), path: written.path, already_captured: false };
});
