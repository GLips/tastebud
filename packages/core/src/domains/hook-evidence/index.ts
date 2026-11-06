export {
  HOOK_REPEAT_WINDOW_TURNS,
  type HookEmission,
  HookEmissionSchema,
  PREVIOUS_TURN_LIMITS,
  type PreviousTurnEvidence,
  PreviousTurnEvidenceSchema,
  type TouchedPath,
  type TranscriptReading,
  TranscriptReadingSchema,
} from "./hook-evidence.ts";
export { hookEmissionFingerprint, parseHookEmissionMarkers, renderHookEmissionMarker } from "./hook-marker.ts";
