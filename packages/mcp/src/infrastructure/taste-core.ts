/** The MCP server's one door into non-domain core: the operation registry and the store host. */
export {
  describeTasteFailure,
  listTasteOperations,
  mcpToolNameOf,
  renderTasteOperationText,
  runTasteOperationAtStoreRoot,
  type TasteOperationListing,
  type TasteOperationWireInput,
} from "@taste/core/operations";
export { resolveTasteStoreRoot } from "@taste/core/host";
