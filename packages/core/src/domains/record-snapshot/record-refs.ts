/** What a caller may type to name a record: a full id, the short id from a file name, or a unique id prefix. */
import { Effect } from "effect";

import type { StoredRecord } from "#core/domains/records/index.ts";

import { AmbiguousRecordRef, UnknownRecordRef } from "./errors.ts";
import type { StoreSnapshot } from "./store-snapshot.ts";

const candidatesForRef = (snapshot: StoreSnapshot, ref: string): Array<StoredRecord> => {
  const trimmed = ref.trim();
  const exact = snapshot.byId.get(trimmed);
  if (exact) return [exact];
  if (trimmed.length < 4) return [];
  return snapshot.records.filter((entry) => entry.shortId === trimmed || entry.record.id.startsWith(trimmed));
};

const pickRecordRef = <R>(
  snapshot: StoreSnapshot,
  ref: string,
  expected: string,
  select: (entry: StoredRecord) => R | undefined,
): Effect.Effect<R, UnknownRecordRef | AmbiguousRecordRef> => {
  const candidates = candidatesForRef(snapshot, ref).flatMap((entry) => {
    const selected = select(entry);
    return selected === undefined ? [] : [{ entry, selected }];
  });
  const [first, ...rest] = candidates;
  if (first === undefined) return Effect.fail(new UnknownRecordRef({ ref, expected }));
  if (rest.length > 0)
    return Effect.fail(
      new AmbiguousRecordRef({ ref, candidates: candidates.map((candidate) => candidate.entry.record.id) }),
    );
  return Effect.succeed(first.selected);
};

export const resolveDerivationRef = (snapshot: StoreSnapshot, ref: string) =>
  pickRecordRef(snapshot, ref, "derivation", (entry) =>
    entry.record.type === "Derivation" ? entry.record : undefined,
  );

export const resolveSourceRef = (snapshot: StoreSnapshot, ref: string) =>
  pickRecordRef(snapshot, ref, "source", (entry) => (entry.record.type === "Source" ? entry.record : undefined));

/** Evidence may be a source or a derivation. */
export const resolveEvidenceRef = (snapshot: StoreSnapshot, ref: string) =>
  pickRecordRef(snapshot, ref, "source or derivation", (entry) =>
    entry.record.type === "Source" || entry.record.type === "Derivation" ? entry.record : undefined,
  );

export const resolveAnyRecordRef = (snapshot: StoreSnapshot, ref: string) =>
  pickRecordRef(snapshot, ref, "record", (entry) => entry);
