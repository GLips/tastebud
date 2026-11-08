/** Builds the view shapes in `view-schemas.ts` from a snapshot. Pure. */
import { findDerivedKind, findSourceKind, type TasteCatalog } from "#core/domains/kind-catalog/index.ts";
import { derivationById, derivationStateOf, type StoreSnapshot } from "#core/domains/record-snapshot/index.ts";
import {
  type DerivationRecord,
  proposedScopeOf,
  type SourceRecord,
  type ThreadEntryRecord,
} from "#core/domains/records/index.ts";
import { compareIsoTimes } from "#core/shared/iso-times.ts";

import type { DerivationSummary, DerivationView, SourceView } from "./view-schemas.ts";

/** What every view builder reads: the records and the catalog that labels their kinds. */
export interface ViewSource {
  readonly snapshot: StoreSnapshot;
  readonly catalog: TasteCatalog;
}

/** The label the account's newest source gives it; sources keep the speaker's name as said at the time. */
const speakerLabelOf = (snapshot: StoreSnapshot, account: string): string | undefined =>
  snapshot.sources
    .filter((source) => source.said_by === account)
    .reduce<SourceRecord | undefined>(
      (newest, source) =>
        newest === undefined || compareIsoTimes(source.said_at, newest.said_at) > 0 ? source : newest,
      undefined,
    )?.said_by_label;

export const summarizeDerivation = (view: ViewSource, derivation: DerivationRecord): DerivationSummary => {
  const state = derivationStateOf(view.snapshot, derivation);
  const subjectLabel =
    derivation.subject === undefined || derivation.subject === "owner"
      ? undefined
      : speakerLabelOf(view.snapshot, derivation.subject);
  const kind = findDerivedKind(view.catalog, derivation.kind);
  const decidedAt = state.decidingDecision?.at;
  const reason = state.decidingDecision?.reason;
  return {
    id: derivation.id,
    kind: derivation.kind,
    kindLabel: kind?.singular ?? derivation.kind,
    retired: kind === undefined,
    statement: derivation.statement,
    status: state.status,
    proposedScope: proposedScopeOf(derivation),
    effectiveScope: state.effectiveScope,
    scopeSource: derivation.scope_source,
    ...(derivation.subject !== undefined && { subject: derivation.subject }),
    ...(subjectLabel !== undefined && { subjectLabel }),
    proposedAt: derivation.proposed_at,
    ...(decidedAt !== undefined && { decidedAt }),
    ...(reason !== undefined && { reason }),
  };
};

export const viewSource = (view: ViewSource, source: SourceRecord): SourceView => {
  const kind = findSourceKind(view.catalog, source.kind);
  return { source, kindLabel: kind?.singular ?? source.kind, retired: kind === undefined };
};

const evidenceOf = (view: ViewSource, ids: ReadonlyArray<string> | undefined) => {
  const sources: Array<SourceView> = [];
  const derivations: Array<DerivationSummary> = [];
  for (const id of ids ?? []) {
    const record = view.snapshot.byId.get(id)?.record;
    if (record?.type === "Source") sources.push(viewSource(view, record));
    else if (record?.type === "Derivation") derivations.push(summarizeDerivation(view, record));
  }
  return { sources, derivations };
};

/** The sources a derivation directly cites in `supports`. */
export const supportingSourcesOf = (view: ViewSource, derivation: DerivationRecord): Array<SourceView> =>
  evidenceOf(view, derivation.supports).sources;

export const threadOf = (snapshot: StoreSnapshot, derivationId: string): Array<ThreadEntryRecord> =>
  snapshot.threadEntries
    .filter((entry) => entry.thread === derivationId)
    .sort((left, right) => compareIsoTimes(left.at, right.at) || left.id.localeCompare(right.id));

/** Walks `supersedes` back to the oldest ancestor. The seen set stops a hand-edited cycle. */
const ancestorsOf = (view: ViewSource, derivation: DerivationRecord): Array<DerivationSummary> => {
  const chain: Array<DerivationSummary> = [];
  const seen = new Set([derivation.id]);
  let older = derivationById(view.snapshot, derivation.supersedes);
  while (older !== undefined && !seen.has(older.id)) {
    seen.add(older.id);
    chain.unshift(summarizeDerivation(view, older));
    older = derivationById(view.snapshot, older.supersedes);
  }
  return chain;
};

export const buildDerivationView = (view: ViewSource, derivation: DerivationRecord): DerivationView => {
  const supports = evidenceOf(view, derivation.supports);
  const contradicts = evidenceOf(view, derivation.contradicts);
  const supersedes = derivationById(view.snapshot, derivation.supersedes);
  return {
    ...summarizeDerivation(view, derivation),
    derivation,
    decisions: derivationStateOf(view.snapshot, derivation).decisions,
    supportingSources: supports.sources,
    supportingDerivations: supports.derivations,
    contradictingSources: contradicts.sources,
    contradictingDerivations: contradicts.derivations,
    ...(supersedes !== undefined && { supersedes: summarizeDerivation(view, supersedes) }),
    ancestors: ancestorsOf(view, derivation),
    revisions: view.snapshot.derivations
      .filter((other) => other.supersedes === derivation.id)
      .map((other) => summarizeDerivation(view, other)),
    despite: (derivation.despite ?? []).flatMap((id) => {
      const despite = derivationById(view.snapshot, id);
      return despite === undefined ? [] : [summarizeDerivation(view, despite)];
    }),
    thread: threadOf(view.snapshot, derivation.id),
  };
};
