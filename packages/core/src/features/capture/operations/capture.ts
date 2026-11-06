/**
 * `capture`: append a source, a human's exact words, whitespace included. The agent is only
 * `captured_via`. It needs nothing looked up first: the kind defaults to the config's conversation
 * kind, and `said_by: "owner"` names the configured owner.
 */
import { Effect, Schema } from "effect";

import { requireSourceKind, type TasteCatalog } from "#core/domains/kind-catalog/index.ts";
import { resolveSourceRef } from "#core/domains/record-snapshot/index.ts";
import { viewSource } from "#core/domains/record-views/index.ts";
import { SCHEMA_VERSION, type SourceRecord } from "#core/domains/records/index.ts";
import type { LoadedTastebudConfig } from "#core/domains/store-config/index.ts";
import { requireAgentActor, type TasteCaller } from "#core/domains/taste-caller/index.ts";
import { OWNER_SUBJECT, SAID_AT_PRECISIONS, type SaidAtPrecision } from "#core/domains/taste-vocabulary/index.ts";
import { resolveOperationContext } from "#core/features/place-context/index.server.ts";
import { TasteStore } from "#core/features/record-store/index.server.ts";
import { stampNewRecord } from "#core/infrastructure/record-ids.ts";
import {
  optionalInputChoice,
  OptionalTrimmedText,
  OptionalTrimmedTextList,
  OptionalVerbatimText,
  TrimmedText,
  VerbatimText,
} from "#core/shared/input-text.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";

export const CaptureSourceInput = Schema.Struct({
  kind: OptionalTrimmedText.annotate({
    description: "Source kind; leave it out for words heard in this conversation",
  }),
  said_by: TrimmedText.annotate({
    description: 'Who said it: "owner" for the owner, else their account, e.g. human:dana or slack:acme/U123',
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
  in: OptionalTrimmedText.annotate({ description: "Capture as if in this directory" }),
  at: OptionalTrimmedTextList.annotate({ description: "Capture as if at these places" }),
});
export type CaptureSourceInput = typeof CaptureSourceInput.Type;

/** Minute precision when the time has no seconds; agents can say `day` explicitly. */
const inferPrecision = (saidAt: string): SaidAtPrecision => (/T\d{2}:\d{2}(Z|[+-])/.test(saidAt) ? "minute" : "second");

const chooseSourceKind = (catalog: TasteCatalog, kind: string | undefined) => {
  const chosen = kind ?? catalog.conversationSourceKind;
  if (chosen !== undefined) return requireSourceKind(catalog, chosen);
  return Effect.fail(
    new InvalidTasteInput({
      problems: [
        `kind is required (the config names no conversationSourceKind): one of ${catalog.sourceKinds.map((known) => known.key).join(", ")}`,
      ],
    }),
  );
};

/** `owner` is the configured owner; anyone else must be named by account and label. */
const resolveSpeaker = (config: LoadedTastebudConfig, input: CaptureSourceInput) => {
  if (input.said_by === OWNER_SUBJECT)
    return Effect.succeed({ saidBy: config.owner, label: input.said_by_label ?? config.ownerName });
  if (input.said_by_label === undefined)
    return Effect.fail(
      new InvalidTasteInput({ problems: [`said_by_label: required for ${input.said_by}; only "owner" may omit it`] }),
    );
  return Effect.succeed({ saidBy: input.said_by, label: input.said_by_label });
};

export const captureSource = Effect.fn("capture.captureSource")(function* (
  input: CaptureSourceInput,
  caller: TasteCaller,
) {
  const store = yield* TasteStore;
  const kind = yield* chooseSourceKind(store.config.catalog, input.kind);
  const speaker = yield* resolveSpeaker(store.config, input);
  const capturedVia = yield* requireAgentActor(caller, "capture");
  const snapshot = yield* store.snapshot;
  const revised = input.revises === undefined ? undefined : yield* resolveSourceRef(snapshot, input.revises);
  if (revised !== undefined && revised.kind !== kind.key)
    return yield* new InvalidTasteInput({
      problems: [`revises: ${revised.id} is a ${revised.kind}, not a ${kind.key}`],
    });
  const context = yield* resolveOperationContext(input, caller, {
    kind: kind.key,
    ...(input.address !== undefined && { address: input.address }),
    saidBy: speaker.saidBy,
  });
  const stamp = yield* stampNewRecord;
  const now = stamp.at;
  const saidAt = input.said_at ?? now;
  const source: SourceRecord = {
    id: stamp.id,
    type: "Source",
    schema_version: SCHEMA_VERSION,
    kind: kind.key,
    said_by: speaker.saidBy,
    said_by_label: speaker.label,
    said_at: saidAt,
    said_at_precision: input.said_at_precision ?? inferPrecision(saidAt),
    captured_at: now,
    captured_via: capturedVia,
    ...(input.address !== undefined && { address: input.address }),
    ...(context.places.length > 0 && { captured_in: context.places }),
    ...(revised !== undefined && { revises: revised.id }),
    quote: input.quote,
    ...(input.before !== undefined && { before: input.before }),
    ...(input.after !== undefined && { after: input.after }),
  };
  const written = yield* store.write(source);
  return { source: viewSource({ snapshot, catalog: store.config.catalog }, source), path: written.path };
});
