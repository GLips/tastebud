/** How a capture names and quotes one Claude Code transcript message. */

/** Whether `quote` is an exact, contiguous stretch of one part; a quote across two parts is not. */
export const quoteFitsTranscriptParts = (parts: ReadonlyArray<string>, quote: string): boolean =>
  parts.some((part) => part.includes(quote));

const TRANSCRIPT_ADDRESS_SCHEME = "claude-code-transcript:";

/** The `address` a source captured from a transcript message carries, so a second capture finds it. */
export const claudeCodeTranscriptAddress = (session: string, message: string): string =>
  `${TRANSCRIPT_ADDRESS_SCHEME}${session}/${message}`;

/** The session a transcript `address` names, or undefined for any other address. */
export const claudeCodeTranscriptSessionOf = (address: string): string | undefined => {
  if (!address.startsWith(TRANSCRIPT_ADDRESS_SCHEME)) return undefined;
  const session = address.slice(TRANSCRIPT_ADDRESS_SCHEME.length).split("/")[0];
  return session === undefined || session === "" ? undefined : session;
};
