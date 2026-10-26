/** The MCP server's one door into non-domain core: the operation registry and the store host. */
export {
  buildTasteOperationCaller,
  describeTasteFailure,
  listTasteOperations,
  mcpToolNameOf,
  renderTasteOperationText,
  runTasteOperation,
  type TasteOperationListing,
  type TasteOperationWireInput,
} from "@taste/core/operations";
export { tasteStoreFromEnv } from "@taste/core/host";
