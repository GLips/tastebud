import type { Database } from "bun:sqlite";
import { statSync } from "node:fs";
import { join } from "node:path";

import { Context, Effect, Layer, Schema } from "effect";

import { formatSchemaProblems, type LoadedTasteConfig, loadTasteConfig } from "./config.ts";
import {
  AmbiguousRecordRef,
  type CorruptRecordFile,
  type InvalidConfig,
  InvalidTasteInput,
  type StoreNotInitialised,
  type StoreWriteFailed,
  UnknownRecordRef,
} from "./errors.ts";
import { renderRecordFile } from "./frontmatter.ts";
import {
  deleteIndexDatabase,
  indexDatabasePath,
  type IndexedRecord,
  type IndexRefreshResult,
  loadIndexedRecords,
  loadIndexedShortIds,
  openIndexDatabase,
  refreshIndex,
  type SearchFilter,
  type SearchHit,
  searchIndex,
} from "./index-db.ts";
import { type DerivationState, deriveDerivationStates } from "./lifecycle.ts";
import type { DecisionRecord, DerivationRecord, SourceRecord, TasteRecord, ThreadEntryRecord } from "./records.ts";
import { proposedScopeOf, TasteRecordSchema } from "./records.ts";
import { recordRelativePath, uniqueShortId, writeFileExclusive } from "./store-files.ts";

interface IndexHandle {
  current: Database;
  /** Inode of the file `current` was opened on; a different or missing one means `.index/` was deleted under us. */
  inode: number;
}

const openIndexHandle = (root: string): IndexHandle => {
  const current = openIndexDatabase(root);
  return { current, inode: statSync(indexDatabasePath(root)).ino };
};

export interface StoreSnapshot {
  readonly records: ReadonlyArray<IndexedRecord>;
  readonly byId: ReadonlyMap<string, IndexedRecord>;
  readonly sources: ReadonlyArray<SourceRecord>;
  readonly derivations: ReadonlyArray<DerivationRecord>;
  readonly decisions: ReadonlyArray<DecisionRecord>;
  readonly threadEntries: ReadonlyArray<ThreadEntryRecord>;
  /** Every derivation's status and effective scope, retired kinds included. */
  readonly derivationStates: ReadonlyMap<string, DerivationState>;
}

const buildStoreSnapshot = (records: ReadonlyArray<IndexedRecord>): StoreSnapshot => {
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

const validateRecord = Schema.decodeUnknownEffect(TasteRecordSchema);

/**
 * One open store and its loaded config. The index connection is private: every method brings it in
 * line with the record files first, so callers never see a stale or deleted index.
 */
export class TasteStore extends Context.Service<
  TasteStore,
  {
    readonly root: string;
    readonly config: LoadedTasteConfig;
    /** Every record, with derivation statuses derived. Every read path starts here. */
    readonly snapshot: Effect.Effect<StoreSnapshot, CorruptRecordFile>;
    /** Full-text hits over derivation statements and reasoning, or source quotes, best first. */
    readonly search: (text: string, filter: SearchFilter) => Effect.Effect<Array<SearchHit>, CorruptRecordFile>;
    /** Validates with Schema, writes the file with exclusive create, then refreshes the index. */
    readonly write: <R extends TasteRecord>(
      record: R,
    ) => Effect.Effect<
      IndexedRecord & { readonly record: R },
      InvalidTasteInput | StoreWriteFailed | CorruptRecordFile
    >;
    /** Deletes the sqlite files and rebuilds them from the record files. */
    readonly rebuild: Effect.Effect<IndexRefreshResult, CorruptRecordFile>;
  }
>()("@taste/TasteStore") {}

/** Opens the store at `root` (see `resolveStoreRoot`), loading its config. Closes the index when the scope ends. */
export const makeTasteStoreLayer = (root: string): Layer.Layer<TasteStore, StoreNotInitialised | InvalidConfig> =>
  Layer.effect(
    TasteStore,
    Effect.gen(function* () {
      const config = yield* loadTasteConfig(root);
      const index = yield* Effect.acquireRelease(
        Effect.sync(() => openIndexHandle(root)),
        (handle) => Effect.sync(() => handle.current.close()),
      );

      // A long-lived process (`taste review listen`) keeps one connection. If someone deletes `.index/`,
      // that connection points at an unlinked file and SQLite fails with "disk I/O error", so reopen first.
      const reopenIfReplaced = () => {
        const inode = statSync(indexDatabasePath(root), { throwIfNoEntry: false })?.ino;
        if (inode === index.inode) return;
        index.current.close();
        Object.assign(index, openIndexHandle(root));
      };
      const freshIndex = Effect.suspend(() => {
        reopenIfReplaced();
        return refreshIndex(index.current, root).pipe(Effect.as(index.current));
      });

      return TasteStore.of({
        root,
        config,
        snapshot: Effect.map(freshIndex, (db) => buildStoreSnapshot(loadIndexedRecords(db))),
        search: (text, filter) => Effect.map(freshIndex, (db) => searchIndex(db, text, filter)),
        write: (record) =>
          Effect.gen(function* () {
            yield* validateRecord(record, { errors: "all", onExcessProperty: "error" }).pipe(
              Effect.mapError((error) => new InvalidTasteInput({ problems: formatSchemaProblems(error) })),
            );
            const shortId = uniqueShortId(record.id, loadIndexedShortIds(yield* freshIndex));
            const path = recordRelativePath(record, shortId);
            yield* writeFileExclusive(join(root, path), renderRecordFile(record));
            yield* freshIndex;
            return { record, path, shortId };
          }),
        rebuild: Effect.suspend(() => {
          index.current.close();
          deleteIndexDatabase(root);
          Object.assign(index, openIndexHandle(root));
          return refreshIndex(index.current, root);
        }),
      });
    }),
  );

/** Provides an open store to `effect` and closes its index afterwards. */
export const provideTasteStore =
  (root: string) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | StoreNotInitialised | InvalidConfig, Exclude<R, TasteStore>> =>
    Effect.provide(effect, makeTasteStoreLayer(root));

const candidatesForRef = (snapshot: StoreSnapshot, ref: string): Array<IndexedRecord> => {
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
  select: (entry: IndexedRecord) => R | undefined,
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

/** A full id, the short id from a file name, or a unique id prefix, naming a derivation. */
export const resolveDerivationRef = (snapshot: StoreSnapshot, ref: string) =>
  pickRecordRef(snapshot, ref, "derivation", (entry) =>
    entry.record.type === "Derivation" ? entry.record : undefined,
  );

/** As `resolveDerivationRef`, for sources. */
export const resolveSourceRef = (snapshot: StoreSnapshot, ref: string) =>
  pickRecordRef(snapshot, ref, "source", (entry) => (entry.record.type === "Source" ? entry.record : undefined));

/** Evidence may be a source or a derivation. */
export const resolveEvidenceRef = (snapshot: StoreSnapshot, ref: string) =>
  pickRecordRef(snapshot, ref, "source or derivation", (entry) =>
    entry.record.type === "Source" || entry.record.type === "Derivation" ? entry.record : undefined,
  );

export const resolveAnyRecordRef = (snapshot: StoreSnapshot, ref: string) =>
  pickRecordRef(snapshot, ref, "record", (entry) => entry);

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
