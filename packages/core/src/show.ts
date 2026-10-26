/** `show`: one record with its evidence, decisions, thread, reverse links, and proposed and effective scope. */
import { Effect, Schema } from "effect";

import { TrimmedText } from "./shared/input-text.ts";
import { resolveAnyRecordRef, TasteStore } from "./store.ts";
import type { ShowResult } from "./view-schemas.ts";
import { buildDerivationView, summarizeDerivation, viewSource, type ViewSource } from "./views.ts";

export const ShowRecordInput = Schema.Struct({
  ref: TrimmedText.annotate({ description: "A full id, the short id from a file name, or a unique prefix" }),
});
export type ShowRecordInput = typeof ShowRecordInput.Type;

export const showTasteRecord = Effect.fn("taste.showTasteRecord")(function* (input: ShowRecordInput) {
  const store = yield* TasteStore;
  const snapshot = yield* store.snapshot;
  const view: ViewSource = { snapshot, catalog: store.config.catalog };
  const { record, path } = yield* resolveAnyRecordRef(snapshot, input.ref);
  const id = record.id;
  const summaries = (predicate: (derivation: (typeof snapshot.derivations)[number]) => boolean) =>
    snapshot.derivations.filter(predicate).map((derivation) => summarizeDerivation(view, derivation));
  const acknowledgingTargets = new Set(
    snapshot.decisions
      .filter((decision) => decision.acknowledges?.includes(id) === true)
      .map((decision) => decision.target),
  );
  const result: ShowResult = {
    record,
    path,
    ...(record.type === "Derivation" && { derivation: buildDerivationView(view, record) }),
    ...(record.type === "Source" && { source: viewSource(view, record) }),
    citedBy: summaries(
      (derivation) => derivation.supports.includes(id) || derivation.contradicts?.includes(id) === true,
    ),
    revisedBy: snapshot.sources.filter((source) => source.revises === id),
    despitedBy: summaries((derivation) => derivation.despite?.includes(id) === true),
    acknowledgedBy: summaries((derivation) => acknowledgingTargets.has(derivation.id)),
  };
  return result;
});
