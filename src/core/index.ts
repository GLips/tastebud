/**
 * Taste core: the one module the CLI, MCP server, review server, hook and tests import. Shells open a
 * store with `provideTasteStore(resolveStoreRoot(…))`, resolve the caller's context with
 * `resolveTasteContext`, then call `runTasteOperation` and print `renderTasteOperationText`.
 * Browser-safe vocabulary and place logic live in `src/shared`.
 */
export type { TasteCaller } from "./caller.ts";
export {
  DEFAULT_HOOK_SETTINGS,
  type DerivedKindDefinition,
  type SourceKindDefinition,
  type TasteCatalog,
} from "./catalog.ts";
export {
  initStore,
  type LoadedTasteConfig,
  type PlaceContext,
  type PlaceResolverFunction,
  resolveStoreRoot,
  TASTE_CONFIG_FILE,
  type TasteConfig,
} from "./config.ts";
export { decideDerivation, type DecideDerivationInput, type DecideDerivationOptions } from "./decide.ts";
export {
  describeTasteFailure,
  type TasteSurface,
  StoreAlreadyExists,
  StoreNotEmpty,
  StoreWriteFailed,
  type TasteError,
  type TasteFailureCategory,
  type TasteFailureDescription,
} from "./errors.ts";
export { buildHookPayload, type HookItem, type HookPayload } from "./hook-payload.ts";
export type { InboxCard, InboxGroup, InboxResult } from "./inbox.ts";
export type { DerivationRow, ListRecordsResult } from "./list.ts";
export {
  LISTEN_HEARTBEAT_MS,
  LISTEN_POLL_MS,
  type ListenEvent,
  type ListenerHeartbeat,
  pollListenerEvents,
  writeListenerHeartbeat,
} from "./listener.ts";
export {
  listTasteOperations,
  mcpToolNameOf,
  renderTasteOperationText,
  runTasteOperation,
  TASTE_OPERATIONS,
  type TasteOperationAudience,
  type TasteOperationInput,
  type TasteOperationKind,
  type TasteOperationListing,
  type TasteOperationName,
  type TasteOperationOutput,
  type TasteServices,
} from "./operation.ts";
export {
  normalizeRemote,
  type RemoteIdentity,
  resolveTasteContext,
  type TasteContextRequest,
} from "./place-resolution.ts";
export type { AuditPlacesResult } from "./places-audit.ts";
export { BELIEF_PROPOSAL_PROMPT } from "./prompts.ts";
export type { RecallExplainItem, RecallExplainResult } from "./recall-explain.ts";
export type { DecisionRecord, DerivationRecord, SourceRecord, TasteRecord, ThreadEntryRecord } from "./records.ts";
export type { RepointPlaceResult, RepointPreviewResult } from "./repoint.ts";
export { listRecordFiles } from "./store-files.ts";
export { provideTasteStore, TasteStore } from "./store.ts";
export { appendOwnerThreadNote, threadReplyInstruction } from "./threads.ts";
export type {
  ContextResult,
  DerivationSummary,
  DerivationView,
  ExcludedRecallHit,
  RecallExclusionReason,
  RecallHit,
  RecallResult,
  RepeatMatch,
  ShowResult,
  SourceHit,
  SourceView,
} from "./view-schemas.ts";
