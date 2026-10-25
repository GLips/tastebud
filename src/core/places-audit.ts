/**
 * `places`: the places in use with counts by kind and status, the resolved context, and the scope
 * audit. A resolver can't prove a place will never come back, so the audit only reports scope places
 * that cover none of the probes the caller supplied.
 */
import { homedir } from "node:os";

import { Effect, Schema } from "effect";

import { OptionalTrimmedText, OptionalTrimmedTextList } from "../shared/input-text.ts";
import { formatPlaceLabel, placeCovers, scopePlacesOf, TasteContextSchema } from "../shared/places.ts";
import { DerivationStatusSchema, type DerivationStatus } from "../shared/vocabulary.ts";
import { canonicalInputPlaces, resolveOperationContext, type TasteCaller } from "./caller.ts";
import { resolvePlacesForDirectory } from "./place-resolution.ts";
import { derivationStateOf, TasteStore } from "./store.ts";
import { DerivationSummarySchema } from "./view-schemas.ts";
import { summarizeDerivation, type ViewSource } from "./views.ts";

export const AuditPlacesInput = Schema.Struct({
  in: OptionalTrimmedText.annotate({ description: "Resolve the context as if in this directory" }),
  at: OptionalTrimmedTextList.annotate({ description: "Take these places as the context" }),
  probes: OptionalTrimmedTextList.annotate({ description: "Directories to resolve and audit against" }),
  probePlaces: OptionalTrimmedTextList.annotate({ description: "Place keys to audit against" }),
});
export type AuditPlacesInput = typeof AuditPlacesInput.Type;

const PlaceCountSchema = Schema.Struct({ kind: Schema.String, status: DerivationStatusSchema, count: Schema.Finite });

export const AuditPlacesResultSchema = Schema.Struct({
  context: TasteContextSchema,
  /** Every place in an effective scope, sorted, with derivation counts. */
  places: Schema.Array(
    Schema.Struct({ place: Schema.String, label: Schema.String, counts: Schema.Array(PlaceCountSchema) }),
  ),
  globalCounts: Schema.Array(PlaceCountSchema),
  audit: Schema.Struct({
    /** What the audit compared against: each probe and the places it resolved to. */
    probes: Schema.Array(Schema.Struct({ probe: Schema.String, places: Schema.Array(Schema.String) })),
    /** Scope places on accepted derivations that cover none of the probes' places. */
    unmatched: Schema.Array(
      Schema.Struct({ place: Schema.String, derivations: Schema.Array(DerivationSummarySchema) }),
    ),
  }),
});
export type AuditPlacesResult = typeof AuditPlacesResultSchema.Type;

const countsOf = (entries: ReadonlyArray<{ readonly kind: string; readonly status: DerivationStatus }>) => {
  const counts = new Map<string, { kind: string; status: DerivationStatus; count: number }>();
  for (const { kind, status } of entries) {
    const key = `${kind}\n${status}`;
    const existing = counts.get(key);
    if (existing !== undefined) existing.count += 1;
    else counts.set(key, { kind, status, count: 1 });
  }
  return [...counts.values()].sort(
    (left, right) => left.kind.localeCompare(right.kind) || left.status.localeCompare(right.status),
  );
};

export const auditTastePlaces = Effect.fn("taste.auditTastePlaces")(function* (
  input: AuditPlacesInput,
  caller: TasteCaller,
) {
  const store = yield* TasteStore;
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog: store.config.catalog };
  const context = yield* resolveOperationContext(input, caller);

  const byPlace = new Map<string, Array<{ kind: string; status: DerivationStatus }>>();
  const global: Array<{ kind: string; status: DerivationStatus }> = [];
  for (const derivation of snapshot.derivations) {
    const state = derivationStateOf(snapshot, derivation);
    const entry = { kind: derivation.kind, status: state.status };
    if (state.effectiveScope.scope === "global") global.push(entry);
    for (const place of scopePlacesOf(state.effectiveScope)) byPlace.set(place, [...(byPlace.get(place) ?? []), entry]);
  }

  const resolvedProbes = yield* Effect.forEach(input.probes ?? [], (directory) =>
    Effect.map(resolvePlacesForDirectory(store.config, directory), (places) => ({
      probe: directory,
      places: [...places],
    })),
  );
  const keyedProbes = yield* canonicalInputPlaces("probePlaces", input.probePlaces ?? [], homedir());
  const probes =
    resolvedProbes.length === 0 && keyedProbes.length === 0
      ? [{ probe: context.cwd ?? "(context)", places: [...context.places] }]
      : [...resolvedProbes, ...keyedProbes.map((place) => ({ probe: place, places: [place] }))];
  const probePlaces = probes.flatMap((probe) => probe.places);

  const unmatched = new Map<string, Array<ReturnType<typeof summarizeDerivation>>>();
  for (const derivation of snapshot.derivations) {
    const state = derivationStateOf(snapshot, derivation);
    if (state.status !== "accepted") continue;
    for (const place of scopePlacesOf(state.effectiveScope)) {
      if (probePlaces.some((probePlace) => placeCovers(place, probePlace))) continue;
      unmatched.set(place, [...(unmatched.get(place) ?? []), summarizeDerivation(view, derivation)]);
    }
  }

  const result: AuditPlacesResult = {
    context,
    places: [...byPlace.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([place, entries]) => ({ place, label: formatPlaceLabel(place), counts: countsOf(entries) })),
    globalCounts: countsOf(global),
    audit: {
      probes,
      unmatched: [...unmatched.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([place, derivations]) => ({ place, derivations })),
    },
  };
  return result;
});
