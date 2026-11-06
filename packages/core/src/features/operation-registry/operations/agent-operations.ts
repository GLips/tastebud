/** The operations agents reach over the CLI and MCP. */
import { Schema } from "effect";

import { RecallResultSchema, ShowResultSchema, SourceViewSchema } from "#core/domains/record-views/index.ts";
import { ThreadEntryRecordSchema } from "#core/domains/records/index.ts";
import { captureSource, CaptureSourceInput, renderCaptureText } from "#core/features/capture/index.server.ts";
import {
  AuditPlacesInput,
  AuditPlacesResultSchema,
  auditTastePlaces,
  renderPlacesText,
} from "#core/features/places-audit/index.server.ts";
import {
  previewTastePlaceRepoint,
  ProposalResultSchema,
  proposeDerivation,
  ProposeDerivationInput,
  renderProposeText,
  renderRepointPreviewText,
  renderRepointText,
  RepointPlaceInput,
  RepointPlaceResultSchema,
  RepointPreviewResultSchema,
  repointTastePlace,
} from "#core/features/proposals/index.server.ts";
import {
  explainRecallEligibility,
  ExplainRecallInput,
  HookPayloadSchema,
  HookPreviewInput,
  previewHookPayload,
  recallDerivations,
  RecallDerivationsInput,
  RecallExplainResultSchema,
  renderHookPreviewText,
  renderRecallExplainText,
  renderRecallText,
} from "#core/features/recall/index.server.ts";
import {
  buildReviewUrl,
  ListRecordsInput,
  ListRecordsResultSchema,
  listTasteRecords,
  renderListText,
  renderShowText,
  ReviewUrlInput,
  ReviewUrlResultSchema,
  ShowRecordInput,
  showTasteRecord,
} from "#core/features/record-browsing/index.server.ts";
import {
  IndexRefreshResultSchema,
  reindexTasteStore,
  renderReindexText,
} from "#core/features/record-store/index.server.ts";
import {
  appendAgentThreadReply,
  renderThreadEntryText,
  ThreadEntryInput,
} from "#core/features/review-threads/index.server.ts";
import {
  readStoreCatalog,
  renderCatalogText,
  StoreCatalogInput,
  StoreCatalogResultSchema,
} from "#core/features/store-catalog/index.server.ts";

import { declareTasteOperation, NoInput } from "./taste-operation-declaration.ts";

export const AGENT_TASTE_OPERATIONS = {
  catalog: declareTasteOperation({
    name: "catalog",
    audience: "agent",
    kind: "query",
    description:
      "The curator's reference: the kinds this store holds, how to propose each (its prompt), where you are, and the store root. With guide, also how to turn the owner's saved words into proposals.",
    input: StoreCatalogInput,
    output: StoreCatalogResultSchema,
    run: readStoreCatalog,
    renderText: renderCatalogText,
  }),
  capture: declareTasteOperation({
    name: "capture",
    audience: "agent",
    kind: "command",
    description:
      'Save a person\'s exact words for the owner to review later. Call it when the owner states a durable preference, corrects your approach, or asks you to remember something: their words verbatim (never yours) with said_by "owner", and enough of what they were reacting to in `before` to keep the meaning. Anyone else is named by account and label.',
    input: CaptureSourceInput,
    output: Schema.Struct({ source: SourceViewSchema, path: Schema.String }),
    run: captureSource,
    renderText: renderCaptureText,
  }),
  propose: declareTasteOperation({
    name: "propose",
    audience: "agent",
    kind: "command",
    description:
      "Propose a derivation of a kind, citing sources, for the owner to ratify. Refused as a near repeat unless `despite` names every match.",
    input: ProposeDerivationInput,
    output: ProposalResultSchema,
    run: proposeDerivation,
    renderText: renderProposeText,
  }),
  recall: declareTasteOperation({
    name: "recall",
    audience: "agent",
    kind: "query",
    description:
      "For debugging and curation, what a search finds here: accepted derivations that apply (what the prompt hook could send), rejections (not accepted) and matching sources, each explained.",
    input: RecallDerivationsInput,
    output: RecallResultSchema,
    run: recallDerivations,
    renderText: renderRecallText,
  }),
  "recall-explain": declareTasteOperation({
    name: "recall-explain",
    audience: "agent",
    kind: "query",
    description:
      "Why one derivation (by ref, or the closest matches to text) would be injected, recalled or excluded here, by recall's own rules.",
    input: ExplainRecallInput,
    output: RecallExplainResultSchema,
    run: explainRecallEligibility,
    renderText: renderRecallExplainText,
  }),
  list: declareTasteOperation({
    name: "list",
    audience: "agent",
    kind: "query",
    description: "Derivations filtered by kind, status, place, subject or text; sources too with `sources`.",
    input: ListRecordsInput,
    output: ListRecordsResultSchema,
    run: (input) => listTasteRecords(input),
    renderText: renderListText,
  }),
  show: declareTasteOperation({
    name: "show",
    audience: "agent",
    kind: "query",
    description: "One record with its evidence, decisions, thread, reverse links, and proposed and effective scope.",
    input: ShowRecordInput,
    output: ShowResultSchema,
    run: (input) => showTasteRecord(input),
    renderText: renderShowText,
  }),
  "thread-reply": declareTasteOperation({
    name: "thread-reply",
    audience: "agent",
    kind: "command",
    description: "Answer on a derivation's review thread, as yourself.",
    input: ThreadEntryInput,
    output: Schema.Struct({ entry: ThreadEntryRecordSchema }),
    run: appendAgentThreadReply,
    renderText: renderThreadEntryText,
  }),
  "hook-preview": declareTasteOperation({
    name: "hook-preview",
    audience: "agent",
    kind: "query",
    description: "The exact payload the prompt hook would inject for a prompt here.",
    input: HookPreviewInput,
    output: HookPayloadSchema,
    run: previewHookPayload,
    renderText: renderHookPreviewText,
  }),
  places: declareTasteOperation({
    name: "places",
    audience: "agent",
    kind: "query",
    description:
      "Places in use with counts, the resolved context, and the scope audit: accepted scope places that cover none of the probes.",
    input: AuditPlacesInput,
    output: AuditPlacesResultSchema,
    run: auditTastePlaces,
    renderText: renderPlacesText,
  }),
  "review-url": declareTasteOperation({
    name: "review-url",
    audience: "agent",
    kind: "query",
    description: "A link to the review UI, or to one record in it, to hand the owner.",
    input: ReviewUrlInput,
    output: ReviewUrlResultSchema,
    run: (input) => buildReviewUrl(input),
    renderText: (result) => result.url,
  }),
  repoint: declareTasteOperation({
    name: "repoint",
    audience: "agent",
    kind: "command",
    description:
      "Propose revisions replacing exact place `from` with `to` on accepted derivations. Proposes only; the owner ratifies.",
    input: RepointPlaceInput,
    output: RepointPlaceResultSchema,
    run: (input) => repointTastePlace(input),
    renderText: renderRepointText,
  }),
  "repoint-preview": declareTasteOperation({
    name: "repoint-preview",
    audience: "agent",
    kind: "query",
    description:
      "What `repoint` would propose for exact place `from` → `to`: each revision and the places it keeps, what is already pending, and what is blocked. Writes nothing.",
    input: RepointPlaceInput,
    output: RepointPreviewResultSchema,
    run: (input) => previewTastePlaceRepoint(input),
    renderText: renderRepointPreviewText,
  }),
  reindex: declareTasteOperation({
    name: "reindex",
    audience: "agent",
    kind: "command",
    description: "Rebuild the disposable .index/ from the record files.",
    input: NoInput,
    output: IndexRefreshResultSchema,
    run: () => reindexTasteStore,
    renderText: renderReindexText,
  }),
} as const;
