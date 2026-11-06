/** The text `transcript-candidates` prints: each candidate's reference and parts, then what was left out. */
import { quoted } from "#core/domains/record-text/index.ts";

import type { TranscriptCandidate, TranscriptCandidatesResult } from "./transcript-candidates.ts";

const candidateLines = (candidate: TranscriptCandidate) => [
  `${candidate.said_at}  ${candidate.places.join(", ")}  (${candidate.because})`,
  `  --transcript-session ${candidate.reference.session} --transcript-message ${candidate.reference.message}`,
  ...candidate.parts.map((part) => `  ${quoted(part)}`),
];

export const renderTranscriptCandidatesText = (result: TranscriptCandidatesResult) => {
  const scope = result.projects.length > 0 ? ` in ${result.projects.join(", ")}` : "";
  const summary = [
    `${String(result.candidates.length)} candidates from ${String(result.sessions)} sessions under ${result.transcript_root} since ${result.since}${scope}.`,
    `Left out: ${String(result.excluded)} excluded, ${String(result.unknown)} unknown, ${String(result.unresolved)} unresolved, ${String(result.other_projects)} in other projects.`,
    ...result.left_out.map((entry) => `  ${String(entry.count)} ${entry.status}: ${entry.problem}`),
  ];
  return [...result.candidates.flatMap(candidateLines), ...(result.candidates.length > 0 ? [""] : []), ...summary].join(
    "\n",
  );
};
