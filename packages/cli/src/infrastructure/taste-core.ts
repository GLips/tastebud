/** The CLI's one door into non-domain core: operations, the store, its host and setup, recall and threads. */
export {
  describeTasteFailure,
  renderTasteOperationText,
  runTasteOperation,
  runTasteOperationAtStoreRoot,
  TASTE_OPERATIONS,
  type TasteCallerOrigin,
  type TasteError,
  type TasteOperationInput,
  type TasteOperationName,
  type TasteOperationOutput,
  type TasteOperationWireInput,
} from "@taste/core/operations";
export { childProcessEnvWithStore, resolveTasteStoreRoot } from "@taste/core/host";
export { provideTasteStore, TasteStore } from "@taste/core/record-store";
export { countStoreRecordFiles, requireNoStoreRecords, writeTasteConfigText } from "@taste/core/store-setup";
export { buildHookPayload } from "@taste/core/recall";
export { resolveTasteContext } from "@taste/core/place-context";
export {
  LISTEN_HEARTBEAT_MS,
  LISTEN_POLL_MS,
  pollListenerEvents,
  writeListenerHeartbeat,
} from "@taste/core/review-threads";
