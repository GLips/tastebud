/**
 * The operation registry: every behaviour a shell reaches by name, declared once with its input and
 * output schemas, audience, kind, description and text rendering. The CLI, MCP and the review server
 * are thin adapters over `runTasteOperation`; human operations never appear on agent surfaces.
 */
import { Effect, Schema } from "effect";

import { CatalogViewSchema } from "../shared/catalog-view.ts";
import { OptionalTrimmedText, OptionalTrimmedTextList } from "../shared/input-text.ts";
import { DerivationScopeSchema, TasteContextSchema } from "../shared/places.ts";
import { resolveOperationContext, type TasteCaller } from "./caller.ts";
import { captureSource, CaptureSourceInput } from "./capture.ts";
import { buildCatalogView } from "./catalog.ts";
import { formatSchemaProblems } from "./config.ts";
import {
  DecideDerivationInput,
  decideDerivation,
  PreviewAcceptanceInput,
  previewDerivationAcceptance,
} from "./decide.ts";
import { InvalidTasteInput, OperationNotAllowed, type TasteError } from "./errors.ts";
import { HookPayloadSchema, HookPreviewInput, previewHookPayload } from "./hook-payload.ts";
import { InboxResultSchema, listInboxGroups } from "./inbox.ts";
import { ListRecordsInput, ListRecordsResultSchema, listTasteRecords } from "./list.ts";
import { AuditPlacesInput, AuditPlacesResultSchema, auditTastePlaces } from "./places-audit.ts";
import { ProposeDerivationInput, proposeDerivation } from "./propose.ts";
import {
  ListContextDerivationsInput,
  listContextDerivations,
  RecallDerivationsInput,
  recallDerivations,
} from "./recall.ts";
import { DecisionRecordSchema, ThreadEntryRecordSchema } from "./records.ts";
import { renderShowText } from "./render/derivation-text.ts";
import {
  renderAcceptancePreviewText,
  renderCaptureText,
  renderCatalogText,
  renderDecideText,
  renderInboxText,
  renderListText,
  renderPlacesText,
  renderProposeText,
  renderReindexText,
  renderRepointText,
  renderThreadEntryText,
} from "./render/operation-text.ts";
import { renderContextText, renderHookPreviewText, renderRecallText } from "./render/recall-text.ts";
import { RepointPlaceInput, RepointPlaceResultSchema, repointTastePlace } from "./repoint.ts";
import { buildReviewUrl, ReviewUrlInput, ReviewUrlResultSchema } from "./review-url.ts";
import { ShowRecordInput, showTasteRecord } from "./show.ts";
import { TasteStore, withFreshTasteConfig } from "./store.ts";
import { appendAgentThreadReply, appendOwnerThreadNote, ThreadEntryInput } from "./threads.ts";
import {
  ContextResultSchema,
  DerivationSummarySchema,
  DerivationViewSchema,
  RecallResultSchema,
  RepeatMatchSchema,
  ShowResultSchema,
  SourceViewSchema,
} from "./view-schemas.ts";

/** Every service an operation may require. A shell provides it with `provideTasteStore(root)`. */
export type TasteServices = TasteStore;

/** `agent` operations are on the CLI and MCP; `human` ones only behind the review server (and seed). */
export type TasteOperationAudience = "agent" | "human";
/** A query only reads; a command appends records (or rebuilds the index). */
export type TasteOperationKind = "query" | "command";

/** An operation's input is a struct, so its encoded form is an object a JSON schema can describe. */
export type TasteOperationInputSchema = Schema.Struct<Schema.Struct.Fields>;

export interface TasteOperationDeclaration<
  Name extends string,
  Input extends TasteOperationInputSchema,
  Output extends Schema.Top,
  E extends TasteError,
> {
  /** CLI `taste <name>`; MCP tool `taste_<name>` with `-` as `_`. */
  readonly name: Name;
  readonly audience: TasteOperationAudience;
  readonly kind: TasteOperationKind;
  /** MCP's tool description and the CLI's help line. */
  readonly description: string;
  readonly input: Input;
  readonly output: Output;
  readonly run: (input: Input["Type"], caller: TasteCaller) => Effect.Effect<Output["Type"], E, TasteServices>;
  /** The text the CLI prints and MCP returns, so both say the same thing. */
  readonly renderText: (output: Output["Type"]) => string;
}

/** Every issue at once, and no unknown fields, so a caller fixes its input in one round. */
const OPERATION_INPUT_DECODING = { errors: "all", onExcessProperty: "error" } as const;

/** Keeps a declaration's literal name and types, and adds the decode-then-run every adapter calls. */
const declareTasteOperation = <
  const Name extends string,
  Input extends TasteOperationInputSchema,
  Output extends Schema.Top,
  E extends TasteError,
>(
  declaration: TasteOperationDeclaration<Name, Input, Output, E>,
) => ({
  ...declaration,
  /** For input as it crossed a wire or a flag parser: decoded whole, transformations included. */
  decodeAndRun: (input: unknown, caller: TasteCaller) =>
    Schema.decodeUnknownEffect(declaration.input)(input, OPERATION_INPUT_DECODING).pipe(
      Effect.mapError((error) => new InvalidTasteInput({ problems: formatSchemaProblems(error) })),
      Effect.flatMap((decoded) => declaration.run(decoded, caller)),
      Effect.withSpan(`taste.operation.${declaration.name}`),
    ),
});

const ContextOverrideInput = Schema.Struct({
  in: OptionalTrimmedText.annotate({ description: "Resolve the context as if in this directory" }),
  at: OptionalTrimmedTextList.annotate({ description: "Take these places as the context" }),
});
const NoInput = Schema.Struct({});

/** Every operation, keyed by its name. One `as const` record, so dispatch keeps each one's types. */
export const TASTE_OPERATIONS = {
  catalog: declareTasteOperation({
    name: "catalog",
    audience: "agent",
    kind: "query",
    description:
      "Read first: the kinds this store holds, how to propose each (its prompt), where you are, and the store root.",
    input: ContextOverrideInput,
    output: Schema.Struct({ catalog: CatalogViewSchema, storeRoot: Schema.String, context: TasteContextSchema }),
    run: (input, caller) =>
      Effect.gen(function* () {
        const store = yield* TasteStore;
        const { config } = store;
        return {
          catalog: buildCatalogView({
            owner: config.owner,
            resolver: config.resolver.name,
            catalog: config.catalog,
            hook: config.hook,
          }),
          storeRoot: store.root,
          context: yield* resolveOperationContext(input, caller),
        };
      }),
    renderText: renderCatalogText,
  }),
  capture: declareTasteOperation({
    name: "capture",
    audience: "agent",
    kind: "command",
    description: "Append a source: a human's exact words, verbatim and attributed. Never your own words.",
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
    output: Schema.Struct({
      derivation: DerivationViewSchema,
      path: Schema.String,
      related: Schema.Array(RepeatMatchSchema),
      warnings: Schema.Array(Schema.String),
    }),
    run: proposeDerivation,
    renderText: renderProposeText,
  }),
  recall: declareTasteOperation({
    name: "recall",
    audience: "agent",
    kind: "query",
    description:
      "Before a judgment call: accepted derivations that apply here, rejections (not accepted), and matching sources, each explained.",
    input: RecallDerivationsInput,
    output: RecallResultSchema,
    run: recallDerivations,
    renderText: renderRecallText,
  }),
  context: declareTasteOperation({
    name: "context",
    audience: "agent",
    kind: "query",
    description: "Every accepted derivation that applies here, for session start (default: the inject kinds).",
    input: ListContextDerivationsInput,
    output: ContextResultSchema,
    run: listContextDerivations,
    renderText: renderContextText,
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
  reindex: declareTasteOperation({
    name: "reindex",
    audience: "agent",
    kind: "command",
    description: "Rebuild the disposable .index/ from the record files.",
    input: NoInput,
    output: Schema.Struct({ mode: Schema.Literals(["fresh", "incremental", "full"]), recordCount: Schema.Finite }),
    run: () => TasteStore.use((store) => store.rebuild),
    renderText: renderReindexText,
  }),
  inbox: declareTasteOperation({
    name: "inbox",
    audience: "human",
    kind: "query",
    description: "Pending derivations grouped by kind, then scope, then subject.",
    input: NoInput,
    output: InboxResultSchema,
    run: () => listInboxGroups(),
    renderText: renderInboxText,
  }),
  "accept-preview": declareTasteOperation({
    name: "accept-preview",
    audience: "human",
    kind: "query",
    description: "What accepting with a scope would settle on, and the near repeats it must acknowledge.",
    input: PreviewAcceptanceInput,
    output: Schema.Struct({
      derivation: DerivationSummarySchema,
      effectiveScope: DerivationScopeSchema,
      needsAcknowledgement: Schema.Array(RepeatMatchSchema),
    }),
    run: (input) => previewDerivationAcceptance(input),
    renderText: renderAcceptancePreviewText,
  }),
  decide: declareTasteOperation({
    name: "decide",
    audience: "human",
    kind: "command",
    description: "Accept (optionally with a scope and acknowledgements), reject or retract a derivation.",
    input: DecideDerivationInput,
    output: Schema.Struct({ decision: DecisionRecordSchema, derivation: DerivationViewSchema }),
    run: (input) => decideDerivation(input),
    renderText: renderDecideText,
  }),
  "thread-note": declareTasteOperation({
    name: "thread-note",
    audience: "human",
    kind: "command",
    description: "The owner's comment on a derivation's thread. Wakes listening agents.",
    input: ThreadEntryInput,
    output: Schema.Struct({ entry: ThreadEntryRecordSchema }),
    run: (input) => appendOwnerThreadNote(input),
    renderText: renderThreadEntryText,
  }),
} as const;

export type TasteOperations = typeof TASTE_OPERATIONS;
export type TasteOperationName = keyof TasteOperations;

// Each key is its operation's name, so a registry lookup and a declaration's `name` never disagree.
true satisfies { [N in TasteOperationName]: TasteOperations[N]["name"] extends N ? true : false }[TasteOperationName];

/** What a caller sends: the input as it crosses the wire, before decoding. */
export type TasteOperationInput<N extends TasteOperationName> = TasteOperations[N]["input"]["Encoded"];
/** What an operation returns: plain JSON, described by its `output` schema. */
export type TasteOperationOutput<N extends TasteOperationName> = TasteOperations[N]["output"]["Type"];

/**
 * The registry seen per name. Indexing this mapped type with a generic name resolves to that name's
 * own signatures, which is what lets dispatch keep each operation's types without a cast.
 */
type TasteOperationRunners = {
  readonly [N in TasteOperationName]: {
    readonly decodeAndRun: (
      input: unknown,
      caller: TasteCaller,
    ) => Effect.Effect<TasteOperationOutput<N>, TasteError, TasteServices>;
    readonly renderText: (output: TasteOperationOutput<N>) => string;
  };
};
const TASTE_OPERATION_RUNNERS: TasteOperationRunners = TASTE_OPERATIONS;

/**
 * Decodes `input` with the operation's schema (every issue, no excess fields), then runs it against a
 * freshly read config. Human operations run only for `via: "review"`; the seed calls their functions
 * directly instead.
 */
export const runTasteOperation = <N extends TasteOperationName>(
  name: N,
  input: unknown,
  caller: TasteCaller,
): Effect.Effect<TasteOperationOutput<N>, TasteError, TasteServices> =>
  TASTE_OPERATIONS[name].audience === "human" && caller.via !== "review"
    ? Effect.fail(new OperationNotAllowed({ operation: name, via: caller.via }))
    : withFreshTasteConfig(TASTE_OPERATION_RUNNERS[name].decodeAndRun(input, caller));

/** The operation's own text for a result, identical across the CLI and MCP. */
export const renderTasteOperationText = <N extends TasteOperationName>(
  name: N,
  output: TasteOperationOutput<N>,
): string => TASTE_OPERATION_RUNNERS[name].renderText(output);

/** An operation read for what shells list: names, audience, kind, description and schemas, types erased. */
export interface TasteOperationListing {
  readonly name: TasteOperationName;
  readonly audience: TasteOperationAudience;
  readonly kind: TasteOperationKind;
  readonly description: string;
  readonly input: TasteOperationInputSchema;
  readonly output: Schema.Top;
}

/** Every operation for one audience, in registry order. MCP lists the `agent` ones as tools. */
export const listTasteOperations = (audience: TasteOperationAudience): ReadonlyArray<TasteOperationListing> =>
  Object.values(TASTE_OPERATIONS).filter((operation) => operation.audience === audience);

/** MCP's tool name for an operation. */
export const mcpToolNameOf = (name: TasteOperationName): string => `taste_${name.replaceAll("-", "_")}`;
