/** Reading the end of a host transcript, which can run to tens of megabytes, without reading it all. */
import { open } from "node:fs/promises";

import { Effect } from "effect";

/** The prompt hook never reads further back than this. */
const TRANSCRIPT_TAIL_BYTES = 256 * 1024;

const readTailText = async (path: string, maxBytes: number) => {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return { text: buffer.toString("utf8"), cut: start > 0 };
  } finally {
    await handle.close();
  }
};

/**
 * The whole lines in the last 256 KiB of `path`. The first is dropped when the read starts mid-file,
 * and whatever follows the last newline is dropped as a line still being written. Fails when the
 * file can't be read; the hook then works from the prompt alone.
 */
export const readTranscriptTailLines = (path: string) =>
  Effect.map(
    Effect.tryPromise(() => readTailText(path, TRANSCRIPT_TAIL_BYTES)),
    ({ text, cut }) => {
      const lines = text.split("\n");
      lines.pop();
      return cut ? lines.slice(1) : lines;
    },
  );
