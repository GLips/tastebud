/** `list`: derivations (and, on request, sources) by kind, status, place, subject or text. Retired kinds included. */
import { homedir } from "node:os";

import { Effect, Schema } from "effect";

import { OptionalTrimmedText, OptionalTrimmedTextList } from "../shared/input-text.ts";
import { matchScopeToContext } from "../shared/places.ts";
import { DerivationStatusSchema } from "../shared/vocabulary.ts";
import { canonicalInputPlaces } from "./caller.ts";
import { UnknownKind } from "./errors.ts";
import { compareIsoTimes } from "./ids.ts";
import { derivationById, derivationStateOf, type StoreSnapshot, TasteStore } from "./store.ts";
import { DerivationSummarySchema, SourceViewSchema } from "./view-schemas.ts";
import { summarizeDerivation, threadOf, viewSource, type ViewSource } from "./views.ts";

export const ListRecordsInput = Schema.Struct({
  kind: OptionalTrimmedTextList.annotate({ description: "Kinds to list, retired ones included" }),
  status: Schema.optionalKey(DerivationStatusSchema),
  place: OptionalTrimmedText.annotate({ description: "Only derivations eligible at this place" }),
  subject: OptionalTrimmedText,
  text: OptionalTrimmedText.annotate({ description: "Full-text filter" }),
  sources: Schema.optionalKey(Schema.Boolean).annotate({ description: "Also list sources" }),
});
export type ListRecordsInput = typeof ListRecordsInput.Type;

const DerivationRowSchema = Schema.Struct({
  ...DerivationSummarySchema.fields,
  /** The accepted revision that retired a superseded derivation. */
  replacedBy: Schema.optionalKey(DerivationSummarySchema),
  threadCount: Schema.Finite,
});
export type DerivationRow = typeof DerivationRowSchema.Type;

export const ListRecordsResultSchema = Schema.Struct({
  derivations: Schema.Array(DerivationRowSchema),
  /** Empty unless sources were asked for. */
  sources: Schema.Array(SourceViewSchema),
});
export type ListRecordsResult = typeof ListRecordsResultSchema.Type;

/** Kind keys in the catalog or on any record; a key in neither is a typo, not an empty list. */
const knownKindKeys = (view: ViewSource) =>
  new Set([
    ...view.catalog.sourceKinds.map((kind) => kind.key),
    ...view.catalog.derivedKinds.map((kind) => kind.key),
    ...view.snapshot.sources.map((source) => source.kind),
    ...view.snapshot.derivations.map((derivation) => derivation.kind),
  ]);

/** Each full-text hit's position, best first: the ranking recall uses. */
const textMatchRanks = (text: string | undefined, type: "Source" | "Derivation") =>
  text === undefined
    ? Effect.void
    : TasteStore.use((store) =>
        Effect.map(store.search(text, { type }), (hits) => new Map(hits.map((hit, rank) => [hit.id, rank]))),
      );

// Only called on ids the text filter kept, so every lookup finds a rank.
const rankIn = (ranks: ReadonlyMap<string, number>, id: string) => ranks.get(id) ?? 0;

const rowOf = (view: ViewSource, snapshot: StoreSnapshot, id: string): DerivationRow | undefined => {
  const derivation = derivationById(snapshot, id);
  if (derivation === undefined) return undefined;
  const replacement = derivationById(snapshot, derivationStateOf(snapshot, derivation).supersededBy[0]);
  return {
    ...summarizeDerivation(view, derivation),
    ...(replacement !== undefined && { replacedBy: summarizeDerivation(view, replacement) }),
    threadCount: threadOf(snapshot, derivation.id).length,
  };
};

/** Best text match first when `text` is given, newest first otherwise. */
export const listTasteRecords = Effect.fn("taste.listTasteRecords")(function* (input: ListRecordsInput) {
  const store = yield* TasteStore;
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog: store.config.catalog };
  const known = knownKindKeys(view);
  const unknown = (input.kind ?? []).find((kind) => !known.has(kind));
  if (unknown !== undefined)
    return yield* new UnknownKind({ kind: unknown, family: "derived", known: [...known].sort() });
  const kinds = input.kind === undefined ? undefined : new Set(input.kind);
  const [place] =
    input.place === undefined ? [undefined] : yield* canonicalInputPlaces("place", [input.place], homedir());
  const derivationText = yield* textMatchRanks(input.text, "Derivation");

  const derivations = snapshot.derivations
    .filter((derivation) => kinds === undefined || kinds.has(derivation.kind))
    .filter((derivation) => input.subject === undefined || derivation.subject === input.subject)
    .filter((derivation) => derivationText === undefined || derivationText.has(derivation.id))
    .filter(
      (derivation) => input.status === undefined || derivationStateOf(snapshot, derivation).status === input.status,
    )
    .filter(
      (derivation) =>
        place === undefined ||
        matchScopeToContext(derivationStateOf(snapshot, derivation).effectiveScope, [place]) !== undefined,
    )
    .sort(
      (left, right) =>
        (derivationText === undefined ? 0 : rankIn(derivationText, left.id) - rankIn(derivationText, right.id)) ||
        compareIsoTimes(right.proposed_at, left.proposed_at) ||
        right.id.localeCompare(left.id),
    )
    .flatMap((derivation) => {
      const row = rowOf(view, snapshot, derivation.id);
      return row === undefined ? [] : [row];
    });

  const sourceText = input.sources === true ? yield* textMatchRanks(input.text, "Source") : undefined;
  const sources =
    input.sources === true
      ? snapshot.sources
          .filter((source) => kinds === undefined || kinds.has(source.kind))
          .filter((source) => sourceText === undefined || sourceText.has(source.id))
          .sort(
            (left, right) =>
              (sourceText === undefined ? 0 : rankIn(sourceText, left.id) - rankIn(sourceText, right.id)) ||
              compareIsoTimes(right.captured_at, left.captured_at),
          )
          .map((source) => viewSource(view, source))
      : [];
  const result: ListRecordsResult = { derivations, sources };
  return result;
});
