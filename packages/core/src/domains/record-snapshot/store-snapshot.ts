/**
 * Every record in the store, grouped by type, with each derivation's status derived. Built fresh from
 * the stored records on every read; nothing caches it, so nothing can serve a stale one.
 */
import { type DerivationState, deriveDerivationStates } from "#core/domains/derivation-lifecycle/index.ts";
import {
  type DecisionRecord,
  type DerivationRecord,
  proposedScopeOf,
  type SourceRecord,
  type StoredRecord,
  type ThreadEntryRecord,
} from "#core/domains/records/index.ts";

export interface StoreSnapshot {
  readonly records: ReadonlyArray<StoredRecord>;
  readonly byId: ReadonlyMap<string, StoredRecord>;
  readonly sources: ReadonlyArray<SourceRecord>;
  readonly derivations: ReadonlyArray<DerivationRecord>;
  readonly decisions: ReadonlyArray<DecisionRecord>;
  readonly threadEntries: ReadonlyArray<ThreadEntryRecord>;
  /** Every derivation's status and effective scope, retired kinds included. */
  readonly derivationStates: ReadonlyMap<string, DerivationState>;
}

export const buildStoreSnapshot = (records: ReadonlyArray<StoredRecord>): StoreSnapshot => {
  const sources: Array<SourceRecord> = [];
  const derivations: Array<DerivationRecord> = [];
  const decisions: Array<DecisionRecord> = [];
  const threadEntries: Array<ThreadEntryRecord> = [];
  for (const { record } of records) {
    if (record.type === "Source") sources.push(record);
    else if (record.type === "Derivation") derivations.push(record);
    else if (record.type === "Decision") decisions.push(record);
    else threadEntries.push(record);
  }
  return {
    records,
    byId: new Map(records.map((entry) => [entry.record.id, entry])),
    sources,
    derivations,
    decisions,
    threadEntries,
    derivationStates: deriveDerivationStates(derivations, decisions),
  };
};

/**
 * The snapshot as it would be with these derivations written, for checking a batch of proposals
 * against one another before any lands. They have no file yet, so no path or short id.
 */
export const snapshotWithUnwrittenDerivations = (
  snapshot: StoreSnapshot,
  derivations: ReadonlyArray<DerivationRecord>,
): StoreSnapshot =>
  derivations.length === 0
    ? snapshot
    : buildStoreSnapshot([...snapshot.records, ...derivations.map((record) => ({ record, path: "", shortId: "" }))]);

/** The derivation with this id, when the snapshot holds one. */
export const derivationById = (snapshot: StoreSnapshot, id: string | undefined): DerivationRecord | undefined => {
  const record = id === undefined ? undefined : snapshot.byId.get(id)?.record;
  return record?.type === "Derivation" ? record : undefined;
};

export const sourceById = (snapshot: StoreSnapshot, id: string): SourceRecord | undefined => {
  const record = snapshot.byId.get(id)?.record;
  return record?.type === "Source" ? record : undefined;
};

/** Every snapshot holds a state for each of its derivations; this reads one without a non-null assertion. */
export const derivationStateOf = (snapshot: StoreSnapshot, derivation: DerivationRecord): DerivationState =>
  snapshot.derivationStates.get(derivation.id) ?? {
    status: "pending",
    decisions: [],
    decidingDecision: undefined,
    acceptingDecision: undefined,
    effectiveScope: proposedScopeOf(derivation),
    supersededBy: [],
  };
