/** The MCP server's one door into non-domain core: the operation registry and the store host. */
export {
  describeTasteFailure,
  listTasteOperations,
  mcpToolNameOf,
  renderTasteOperationText,
  runTasteOperationAtStoreRoot,
  type TasteOperationListing,
  type TasteOperationWireInput,
} from "@tastebud/core/operations";
export { resolveTasteStoreRoot } from "@tastebud/core/host";
