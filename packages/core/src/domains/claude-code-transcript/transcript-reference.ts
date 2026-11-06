/** How a capture names and quotes one Claude Code transcript message. */

/** Whether `quote` is an exact, contiguous stretch of one part; a quote across two parts is not. */
export const quoteFitsTranscriptParts = (parts: ReadonlyArray<string>, quote: string): boolean =>
  parts.some((part) => part.includes(quote));

/** The `address` a source captured from a transcript message carries, so a second capture finds it. */
export const claudeCodeTranscriptAddress = (session: string, message: string): string =>
  `claude-code-transcript:${session}/${message}`;
