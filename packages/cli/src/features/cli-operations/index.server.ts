export { emitCliResult, inCliStore, resolveCliStoreRoot } from "./controllers/run-cli-operation.ts";
export type { CliOperationOptions } from "./controllers/run-cli-operation.ts";
export { reportCliFailure } from "./controllers/report-cli-failure.ts";
export type { CliFailure } from "./controllers/report-cli-failure.ts";
export {
  configCheckCommand,
  configShowCommand,
  configWriteCommand,
  initCommand,
} from "./controllers/config-commands.ts";
export { reindexCommand } from "./controllers/store-commands.ts";
export {
  catalogCommand,
  listCommand,
  openCommand,
  placesCommand,
  recallCommand,
  recallExplainCommand,
  repointPreviewCommand,
  reviewUrlCommand,
  showCommand,
} from "./controllers/query-commands.ts";
export { captureCommand, proposeCommand, repointCommand, threadReplyCommand } from "./controllers/write-commands.ts";
export { hookCommand, mcpCommand } from "./controllers/hook-commands.ts";
