/**
 * Taste core: the one module the CLI, MCP server, review server, hook and tests import. Shells open a
 * store with `provideTasteStore(resolveStoreRoot(…))`, resolve the caller's context with
 * `resolveTasteContext`, then call `runTasteOperation` and print `renderTasteOperationText`.
 * Browser-safe vocabulary and place logic live in `src/shared`.
 */
export type { TasteCaller } from "./caller.ts";
export {
  BUILT_IN_BELIEF_KIND,
  buildCatalogView,
  DEFAULT_DERIVED_KINDS,
  DEFAULT_HOOK_SETTINGS,
  DEFAULT_SOURCE_KINDS,
  type DerivedKindDefinition,
  type SourceKindDefinition,
  type TasteCatalog,
} from "./catalog.ts";
export {
  initStore,
  type LoadedTasteConfig,
  loadTasteConfig,
  type PlaceContext,
  type PlaceResolverFunction,
  resolveStoreRoot,
  TASTE_CONFIG_FILE,
  type TasteConfig,
} from "./config.ts";
export { decideDerivation, type DecideDerivationInput, type DecideDerivationOptions } from "./decide.ts";
export {
  AmbiguousRecordRef,
  CorruptRecordFile,
  DecisionLockTimeout,
  OperationNotAllowed,
  DecisionNotAllowed,
  describeTasteFailure,
  InvalidConfig,
  InvalidTasteInput,
  KindNotRecallable,
  NearRepeat,
  PlaceResolutionFailed,
  RetiredKind,
  ScopeRequired,
  StoreAlreadyExists,
  StoreNotEmpty,
  StoreNotInitialised,
  StoreWriteFailed,
  type TasteError,
  type TasteFailureCategory,
  type TasteFailureDescription,
  UnknownKind,
  UnknownRecordRef,
  WideningNeedsAcknowledgement,
} from "./errors.ts";
export { buildHookPayload, type HookItem, type HookPayload } from "./hook-payload.ts";
export { formatLocalIsoTime } from "./ids.ts";
export type { InboxCard, InboxGroup, InboxResult } from "./inbox.ts";
export type { DerivationRow, ListRecordsResult } from "./list.ts";
export {
  LISTEN_HEARTBEAT_MS,
  LISTEN_POLL_MS,
  type ListenEvent,
  type ListenerHeartbeat,
  listListenerHeartbeats,
  pollListenerEvents,
  writeListenerHeartbeat,
} from "./listener.ts";
export {
  isTasteOperationName,
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
  resolvePlacesForDirectory,
  resolveTasteContext,
  type TasteContextRequest,
} from "./place-resolution.ts";
export type { AuditPlacesResult } from "./places-audit.ts";
export { BELIEF_PROPOSAL_PROMPT } from "./prompts.ts";
export type { DecisionRecord, DerivationRecord, SourceRecord, TasteRecord, ThreadEntryRecord } from "./records.ts";
export type { RepointPlaceResult } from "./repoint.ts";
export { RELATED_THRESHOLD, REPEAT_THRESHOLD } from "./similarity.ts";
export { listRecordFiles } from "./store-files.ts";
export { makeTasteStoreLayer, provideTasteStore, TasteStore, withFreshTasteConfig } from "./store.ts";
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
