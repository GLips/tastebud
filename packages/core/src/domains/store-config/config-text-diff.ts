/**
 * A unified diff between two config texts, for the agent to show the owner before a config write.
 * A config is a few hundred lines at most, so a plain LCS table is fast enough and exact.
 */
const CONTEXT_LINES = 3;

/** A line, and whether a newline ends it: only a file's last line can lack one. */
type TextLine = { readonly text: string; readonly endsWithNewline: boolean };
type DiffLine = TextLine & { readonly op: " " | "-" | "+" };

const NO_NEWLINE_MARKER = "\\ No newline at end of file";

const linesOf = (text: string): Array<TextLine> => {
  if (text === "") return [];
  const endsWithNewline = text.endsWith("\n");
  const lines = (endsWithNewline ? text.slice(0, -1) : text).split("\n");
  return lines.map((line, index) => ({ text: line, endsWithNewline: endsWithNewline || index < lines.length - 1 }));
};

/** Lines are equal only with the same ending, so a changed final newline shows as a changed last line. */
const sameLine = (left: TextLine, right: TextLine) =>
  left.text === right.text && left.endsWithNewline === right.endsWithNewline;

const diffLines = (before: ReadonlyArray<TextLine>, after: ReadonlyArray<TextLine>): Array<DiffLine> => {
  const width = after.length + 1;
  // common[i * width + j]: the longest common subsequence of before[i..] and after[j..].
  const common = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1)
    for (let j = after.length - 1; j >= 0; j -= 1)
      common[i * width + j] = sameLine(before[i]!, after[j]!)
        ? common[(i + 1) * width + j + 1]! + 1
        : Math.max(common[(i + 1) * width + j]!, common[i * width + j + 1]!);
  const lines: Array<DiffLine> = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && sameLine(before[i]!, after[j]!)) {
      lines.push({ op: " ", ...before[i]! });
      i += 1;
      j += 1;
    } else if (
      i < before.length &&
      (j === after.length || common[(i + 1) * width + j]! >= common[i * width + j + 1]!)
    ) {
      lines.push({ op: "-", ...before[i]! });
      i += 1;
    } else {
      lines.push({ op: "+", ...after[j]! });
      j += 1;
    }
  }
  return lines;
};

const hunkRange = (start: number, count: number) =>
  count === 1 ? `${start}` : `${count === 0 ? start - 1 : start},${count}`;

/** Groups changed lines with their context into `@@` hunks. */
const renderHunks = (lines: ReadonlyArray<DiffLine>): Array<string> => {
  const changed = lines.flatMap((line, index) => (line.op === " " ? [] : [index]));
  const hunks: Array<string> = [];
  let cursor = 0;
  while (cursor < changed.length) {
    const first = changed[cursor]!;
    let last = first;
    while (cursor + 1 < changed.length && changed[cursor + 1]! - last <= CONTEXT_LINES * 2 + 1) {
      cursor += 1;
      last = changed[cursor]!;
    }
    cursor += 1;
    const from = Math.max(0, first - CONTEXT_LINES);
    const to = Math.min(lines.length, last + CONTEXT_LINES + 1);
    const before = lines.slice(0, from);
    const slice = lines.slice(from, to);
    const oldStart = before.filter((line) => line.op !== "+").length + 1;
    const newStart = before.filter((line) => line.op !== "-").length + 1;
    const oldCount = slice.filter((line) => line.op !== "+").length;
    const newCount = slice.filter((line) => line.op !== "-").length;
    hunks.push(
      `@@ -${hunkRange(oldStart, oldCount)} +${hunkRange(newStart, newCount)} @@`,
      ...slice.flatMap((line) =>
        line.endsWithNewline ? [`${line.op}${line.text}`] : [`${line.op}${line.text}`, NO_NEWLINE_MARKER],
      ),
    );
  }
  return hunks;
};

/**
 * `before` → `after` as a unified diff of `fileName`; `before` undefined is a new file. Empty when
 * the texts are the same.
 */
export const unifiedConfigTextDiff = (fileName: string, before: string | undefined, after: string): string => {
  if (before === after) return "";
  const hunks = renderHunks(diffLines(linesOf(before ?? ""), linesOf(after)));
  return [before === undefined ? "--- /dev/null" : `--- a/${fileName}`, `+++ b/${fileName}`, ...hunks].join("\n");
};
