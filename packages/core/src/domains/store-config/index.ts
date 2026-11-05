export {
  TASTE_CONFIG_FILE,
  TasteConfigFileSchema,
  loadedTasteConfigOf,
  starterTasteConfigText,
} from "./config-schema.ts";
export type {
  LoadedTasteConfig,
  PlaceContext,
  PlaceResolverFunction,
  PlaceResolverSetting,
  TasteConfig,
  TasteConfigFile,
} from "./config-schema.ts";
export { unifiedConfigTextDiff } from "./config-text-diff.ts";
export { TASTE_SETUP_INTERVIEW } from "./setup-interview.ts";
