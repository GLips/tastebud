/** Text for the write operations and the listings. The CLI prints these and MCP returns them verbatim. */
import type { CatalogView } from "../../shared/catalog-view.ts";
import { formatScopeLabel, type TasteContext } from "../../shared/places.ts";
import type { InboxResult } from "../inbox.ts";
import type { IndexRefreshResult } from "../index-db.ts";
import type { ListRecordsResult } from "../list.ts";
import type { ListenerHeartbeat } from "../listener.ts";
import type { AuditPlacesResult } from "../places-audit.ts";
import type { DecisionRecord, ThreadEntryRecord } from "../records.ts";
import type { RepointPlaceResult, RepointPreviewResult } from "../repoint.ts";
import type { DerivationSummary, DerivationView, RepeatMatch, SourceView } from "../view-schemas.ts";
import { formatContextLine } from "./recall-text.ts";
import { formatDerivationSummary, formatRepeatMatches, formatScopeBraces, quoted, section } from "./text-helpers.ts";

export const renderCaptureText = (result: { readonly source: SourceView; readonly path: string }) =>
  [
    `Captured ${result.source.kindLabel} ${result.source.source.id}`,
    `  ${quoted(result.source.source.quote)}`,
    ...(result.source.source.captured_in === undefined
      ? []
      : [`  captured in: ${result.source.source.captured_in.join(", ")}`]),
  ].join("\n");

export const renderProposeText = (result: {
  readonly derivation: DerivationView;
  readonly related: ReadonlyArray<RepeatMatch>;
  readonly warnings: ReadonlyArray<string>;
}) =>
  [
    `Proposed ${result.derivation.kindLabel} ${result.derivation.id}`,
    `  ${result.derivation.statement}  ${formatScopeBraces(result.derivation)}${result.derivation.scopeSource === "defaulted" ? " (scope defaulted from your context)" : ""}`,
    "  Pending until the owner decides in the review UI (review-url gives the link).",
    ...result.warnings.map((warning) => `  Warning: ${warning}`),
    ...formatRepeatMatches("Related:", result.related),
  ].join("\n");

export const renderDecideText = (result: { readonly decision: DecisionRecord; readonly derivation: DerivationView }) =>
  `${result.decision.outcome} ${result.derivation.kindLabel} ${result.derivation.id}: now ${result.derivation.status}, scope ${formatScopeLabel(result.derivation.effectiveScope)}`;

export const renderAcceptancePreviewText = (result: {
  readonly derivation: DerivationSummary;
  readonly effectiveScope: DerivationSummary["effectiveScope"];
  readonly needsAcknowledgement: ReadonlyArray<RepeatMatch>;
}) =>
  [
    `Accepting ${formatDerivationSummary(result.derivation)}`,
    `  with scope ${formatScopeLabel(result.effectiveScope)}`,
    ...(result.needsAcknowledgement.length === 0
      ? ["  No near repeats to acknowledge."]
      : formatRepeatMatches("Acknowledge these near repeats first:", result.needsAcknowledgement)),
  ].join("\n");

export const renderThreadEntryText = (result: { readonly entry: ThreadEntryRecord }) =>
  `Added ${result.entry.author}'s entry ${result.entry.id} to ${result.entry.thread}'s thread.`;

export const renderListText = (result: ListRecordsResult) =>
  [
    section(
      "Derivations",
      result.derivations.map(
        (row) =>
          `- ${formatDerivationSummary(row)}  ${formatScopeBraces(row)}` +
          (row.replacedBy === undefined ? "" : `\n    replaced by ${row.replacedBy.id}`) +
          (row.threadCount === 0 ? "" : `\n    ${row.threadCount} thread entries`),
      ),
    ),
    ...(result.sources.length === 0
      ? []
      : [
          section(
            "Sources",
            result.sources.map(
              (view) =>
                `- ${quoted(view.source.quote)} (${view.kindLabel}, ${view.source.said_by_label})  [${view.source.id}]`,
            ),
          ),
        ]),
  ].join("\n\n");

export const renderInboxText = (result: InboxResult) =>
  result.groups.length === 0
    ? "(nothing pending)"
    : result.groups
        .map((group) =>
          section(
            `${group.kindPlural} · ${formatScopeLabel(group.scope)}${group.subject === undefined ? "" : ` · ${group.subject}`}`,
            group.cards.map(
              (card) =>
                `- ${card.derivation.statement}  [${card.derivation.id}]` +
                (card.needsAcknowledgement.length === 0
                  ? ""
                  : `\n    ${card.needsAcknowledgement.length} near repeats to acknowledge`),
            ),
          ),
        )
        .join("\n\n");

const formatCounts = (counts: AuditPlacesResult["globalCounts"]) =>
  counts.map((count) => `${count.count} ${count.kind} ${count.status}`).join(", ");

export const renderPlacesText = (result: AuditPlacesResult) =>
  [
    formatContextLine(result.context),
    section("Places in use", [
      ...(result.globalCounts.length === 0 ? [] : [`- global · ${formatCounts(result.globalCounts)}`]),
      ...result.places.map((entry) => `- ${entry.place} · ${formatCounts(entry.counts)}`),
    ]),
    section(
      `Unmatched by these probes (${result.audit.probes.map((probe) => probe.probe).join(", ")})`,
      result.audit.unmatched.map(
        (entry) =>
          `- ${entry.place}\n${entry.derivations.map((summary) => `    ${formatDerivationSummary(summary)}`).join("\n")}`,
      ),
    ),
  ].join("\n\n");

export const renderRepointText = (result: RepointPlaceResult) =>
  [
    `Repoint ${result.from} → ${result.to}`,
    section(
      "Proposed revisions (pending until ratified)",
      result.proposals.map(
        (proposal) => `- ${proposal.revision.id} supersedes ${formatDerivationSummary(proposal.supersedes)}`,
      ),
    ),
    ...(result.alreadyPending.length === 0
      ? []
      : [
          section(
            "Already pending",
            result.alreadyPending.map((summary) => `- ${formatDerivationSummary(summary)}`),
          ),
        ]),
    ...(result.blocked.length === 0
      ? []
      : [
          section(
            "Blocked (not proposed)",
            result.blocked.map((entry) => `- ${formatDerivationSummary(entry.derivation)}: ${entry.problem}`),
          ),
        ]),
  ].join("\n");

export const renderRepointPreviewText = (result: RepointPreviewResult) =>
  [
    `Repoint ${result.from} → ${result.to} would propose (nothing written)`,
    section(
      "Revisions",
      result.revisions.map(
        (revision) =>
          `- ${formatDerivationSummary(revision.supersedes)}` +
          (revision.keptPlaces.length === 0 ? "" : `\n    keeps ${revision.keptPlaces.join(", ")}`),
      ),
    ),
    ...(result.alreadyPending.length === 0
      ? []
      : [
          section(
            "Already pending",
            result.alreadyPending.map((summary) => `- ${formatDerivationSummary(summary)}`),
          ),
        ]),
    ...(result.blocked.length === 0
      ? []
      : [
          section(
            "Blocked (would not be proposed)",
            result.blocked.map((entry) => `- ${formatDerivationSummary(entry.derivation)}: ${entry.problem}`),
          ),
        ]),
    ...(result.pendingAtFrom.length === 0
      ? []
      : [
          section(
            `Pending proposals still at ${result.from} (repoint leaves these alone)`,
            result.pendingAtFrom.map((summary) => `- ${formatDerivationSummary(summary)}`),
          ),
        ]),
  ].join("\n");

export const renderListenersText = (result: { readonly listeners: ReadonlyArray<ListenerHeartbeat> }) =>
  section(
    "Listeners",
    result.listeners.map(
      (listener) =>
        `- ${listener.name}: ${listener.listening ? "listening" : "not listening"} (last heartbeat ${listener.heartbeatAt ?? "never"})`,
    ),
  );

export const renderReindexText = (result: IndexRefreshResult) => `Reindexed ${result.recordCount} records.`;

/** Kind prompts are config text written once for both surfaces, so the catalog says how to read their flags. */
const PROMPT_SPELLING_NOTE =
  "Prompts spell inputs as CLI flags. Over MCP, each is the taste_propose field of the same name with " +
  '_ for -, except --place <key> (scope: "places" with places: [<key>]) and --global (scope: "global").';

export const renderCatalogText = (result: {
  readonly catalog: CatalogView;
  readonly storeRoot: string;
  readonly context: TasteContext;
  readonly pendingByKind: Readonly<Record<string, number>>;
}) =>
  [
    `Store ${result.storeRoot} · owner ${result.catalog.owner} · resolver ${result.catalog.resolver}`,
    formatContextLine(result.context),
    section(
      "Source kinds",
      result.catalog.sourceKinds.map((kind) => `- ${kind.key}: ${kind.description ?? kind.plural}`),
    ),
    section(
      "Derived kinds",
      result.catalog.derivedKinds.map(
        (kind) =>
          `- ${kind.key} (recall: ${kind.recall}; cites ${kind.sources.join(", ")}; ${result.pendingByKind[kind.key] ?? 0} pending): ${kind.description ?? kind.plural}\n\n` +
          kind.proposalPrompt
            .split("\n")
            .map((line) => `    ${line}`)
            .join("\n"),
      ),
    ),
    PROMPT_SPELLING_NOTE,
  ].join("\n\n");
