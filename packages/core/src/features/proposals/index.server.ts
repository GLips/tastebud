export { NearRepeat, ScopeRequired } from "./errors.ts";
export { renderProposeText, renderRepointPreviewText, renderRepointText } from "./operations/proposal-text.ts";
export {
  ProposalResultSchema,
  ProposeDerivationInput,
  appendDerivationProposal,
  checkDerivationProposal,
  proposeDerivation,
  resolveDespiteRefs,
} from "./operations/propose.ts";
export type { DerivationProposalAuthorship, DerivationProposalParts } from "./operations/propose.ts";
export { RepointPreviewResultSchema, previewTastePlaceRepoint } from "./operations/repoint-preview.ts";
export type { RepointPreviewResult } from "./operations/repoint-preview.ts";
export {
  RepointAlreadyPendingSchema,
  RepointBlockedSchema,
  RepointPlaceInput,
  RepointPlaceResultSchema,
  planRepointRevisions,
  repointTastePlace,
} from "./operations/repoint.ts";
export type { RepointPlaceResult } from "./operations/repoint.ts";
