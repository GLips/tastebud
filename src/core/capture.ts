/** `capture`: append a source, a human's exact words, whitespace included. The agent is only `captured_via`. */
import { Effect, Schema } from "effect";

import {
  OptionalTrimmedText,
  OptionalTrimmedTextList,
  OptionalVerbatimText,
  optionalInputChoice,
  TrimmedText,
  VerbatimText,
} from "../shared/input-text.ts";
import { SAID_AT_PRECISIONS, type SaidAtPrecision } from "../shared/vocabulary.ts";
import { type TasteCaller, requireAgentActor, resolveOperationContext } from "./caller.ts";
import { requireSourceKind, type TasteCatalog } from "./catalog.ts";
import { InvalidTasteInput } from "./errors.ts";
import { stampNewRecord } from "./ids.ts";
import { SCHEMA_VERSION, type SourceRecord } from "./records.ts";
import { resolveSourceRef, TasteStore } from "./store.ts";
import { viewSource } from "./views.ts";

export const CaptureSourceInput = Schema.Struct({
  kind: OptionalTrimmedText.annotate({ description: "Source kind; may be omitted when the catalog has one" }),
  said_by: TrimmedText.annotate({ description: "The speaker's account, e.g. human:dana or slack:acme/U123" }),
  said_by_label: TrimmedText.annotate({ description: "The speaker's display name" }),
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
  if (kind !== undefined) return requireSourceKind(catalog, kind);
  const [only, ...others] = catalog.sourceKinds;
  if (only !== undefined && others.length === 0) return Effect.succeed(only);
  return Effect.fail(
    new InvalidTasteInput({
      problems: [`kind is required: one of ${catalog.sourceKinds.map((known) => known.key).join(", ")}`],
    }),
  );
};

export const captureSource = Effect.fn("taste.captureSource")(function* (
  input: CaptureSourceInput,
  caller: TasteCaller,
) {
  const store = yield* TasteStore;
  const kind = yield* chooseSourceKind(store.config.catalog, input.kind);
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
    saidBy: input.said_by,
  });
  const stamp = yield* stampNewRecord;
  const now = stamp.at;
  const saidAt = input.said_at ?? now;
  const source: SourceRecord = {
    id: stamp.id,
    type: "Source",
    schema_version: SCHEMA_VERSION,
    kind: kind.key,
    said_by: input.said_by,
    said_by_label: input.said_by_label,
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
