export {
  type HookEmission,
  HookEmissionSchema,
  PREVIOUS_TURN_LIMITS,
  type PreviousTurnEvidence,
  PreviousTurnEvidenceSchema,
  type RecordedHookEmission,
  RecordedHookEmissionSchema,
  type TouchedPath,
  type TranscriptReading,
  TranscriptReadingSchema,
} from "./hook-evidence.ts";
export { hookEmissionFingerprint, parseHookEmissionMarkers, renderHookEmissionMarker } from "./hook-marker.ts";
export {
  HOOK_OUTPUT_BUDGET_CHARS,
  HOOK_REPEAT_WINDOW_TURNS,
  type HookCandidate,
  type HookExcludedCandidate,
  type HookExclusion,
  HookExclusionSchema,
  type HookMatchedBy,
  HookMatchedBySchema,
  type HookSelection,
  mergeHookCandidates,
  previousTurnSearchText,
  selectHookItems,
} from "./hook-selection.ts";
