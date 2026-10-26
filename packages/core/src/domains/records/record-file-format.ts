/**
 * The record file layout, minus YAML: frontmatter fields apart from the markdown body sections. The
 * frontmatter codec (infrastructure) turns the field mapping into text and back.
 */
import { Effect, Result, Schema } from "effect";

import { CorruptRecordFile } from "#core/shared/corrupt-record-file.ts";
import type { FrontmatterMapping, FrontmatterValue } from "#core/shared/frontmatter-value.ts";

import { type TasteRecord, TasteRecordSchema } from "./record-schemas.ts";

/** Fields that live in the markdown body, not the frontmatter. */
const BODY_FIELD_NAMES = ["quote", "before", "after", "reasoning", "despite_case", "text"] as const;
type RecordBodyField = (typeof BODY_FIELD_NAMES)[number];
const BODY_FIELDS: ReadonlySet<string> = new Set(BODY_FIELD_NAMES);

/**
 * Body text is stored verbatim except that a line starting with `## ` or a backslash gets a leading
 * backslash, so the only unescaped `## ` lines are section headings and every body round-trips exactly.
 */
const escapeBodyText = (text: string) =>
  text
    .split("\n")
    .map((line) => (line.startsWith("\\") || line.startsWith("## ") ? `\\${line}` : line))
    .join("\n");

const unescapeBodyText = (text: string) =>
  text
    .split("\n")
    .map((line) => (line.startsWith("\\") ? line.slice(1) : line))
    .join("\n");

/** `## Heading`, a blank line, the text, and one newline ending it. Sections are joined by a blank line. */
const section = (heading: string, text: string | undefined) =>
  text === undefined ? [] : [`## ${heading}\n\n${escapeBodyText(text)}\n`];

const renderBody = (record: TasteRecord): string => {
  switch (record.type) {
    case "Source":
      return [
        ...section("Quote", record.quote),
        ...section("Before", record.before),
        ...section("After", record.after),
      ].join("\n");
    case "Derivation":
      return [`${escapeBodyText(record.reasoning)}\n`, ...section("Despite", record.despite_case)].join("\n");
    case "Decision":
      return "";
    case "ThreadEntry":
      return `${escapeBodyText(record.text)}\n`;
  }
};

/** A record's frontmatter fields and its markdown body, ready for the codec to join. */
export interface RecordFileParts {
  readonly frontmatter: FrontmatterMapping;
  readonly body: string;
}

export const recordFileParts = (record: TasteRecord): RecordFileParts => {
  const frontmatter: { [field: string]: FrontmatterValue } = {};
  for (const [key, value] of Object.entries<FrontmatterValue | undefined>(record)) {
    if (!BODY_FIELDS.has(key) && value !== undefined) frontmatter[key] = value;
  }
  return { frontmatter, body: renderBody(record) };
};

/** `---`, the frontmatter text (ending in a newline), `---`, one blank line, then the body. */
export const joinRecordFileText = (frontmatterText: string, body: string): string =>
  `---\n${frontmatterText}---\n\n${body}`;

/**
 * The inverse of the layout `section` writes. A chunk ends with its text's own newline, plus the
 * blank separator line when another section follows; both are removed before unescaping.
 */
const chunkText = (chunk: string, followed: boolean) =>
  unescapeBodyText(chunk.replace(followed ? /\n?\n$/ : /\n$/, ""));

/** Splits on unescaped `## Heading` lines; escaping guarantees no text line looks like one. */
const splitSections = (body: string, headings: ReadonlyArray<string>) => {
  const pattern = new RegExp(`^## (${headings.join("|")})[ \\t]*\\n\\n?`, "m");
  const sections: Record<string, string> = {};
  let lead = "";
  let rest = body;
  let current: string | undefined;
  for (;;) {
    const match = pattern.exec(rest);
    const chunk = chunkText(match ? rest.slice(0, match.index) : rest, match !== null);
    if (current === undefined) lead = chunk;
    else sections[current] = chunk;
    if (!match) break;
    current = match[1];
    rest = rest.slice(match.index + match[0].length);
  }
  return { lead, sections };
};

const nonEmpty = (text: string | undefined) => (text ? { value: text } : undefined);

const bodyFields = (frontmatter: FrontmatterMapping, body: string): Partial<Record<RecordBodyField, string>> => {
  switch (frontmatter["type"]) {
    case "Source": {
      const { sections } = splitSections(body, ["Quote", "Before", "After"]);
      return {
        quote: sections["Quote"] ?? "",
        ...(nonEmpty(sections["Before"]) && { before: sections["Before"] }),
        ...(nonEmpty(sections["After"]) && { after: sections["After"] }),
      };
    }
    case "Derivation": {
      const { lead, sections } = splitSections(body, ["Despite"]);
      return { reasoning: lead, ...(nonEmpty(sections["Despite"]) && { despite_case: sections["Despite"] }) };
    }
    case "ThreadEntry":
      return { text: chunkText(body, false) };
    default:
      return {};
  }
};

const decodeRecord = Schema.decodeUnknownEffect(TasteRecordSchema);

/** A record file's frontmatter text and body, or why it has neither. */
export const splitRecordFileText = (
  path: string,
  content: string,
): Result.Result<{ readonly frontmatterText: string; readonly body: string }, CorruptRecordFile> => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) return Result.fail(new CorruptRecordFile({ path, problem: "missing YAML frontmatter" }));
  // The renderer puts one blank line between the frontmatter and the body.
  return Result.succeed({ frontmatterText: match[1] ?? "", body: (match[2] ?? "").replace(/^\r?\n/, "") });
};

/** A parsed frontmatter mapping and its body as a record. Frontmatter is failsafe, so every scalar is a string. */
export const decodeRecordFileParts = (
  path: string,
  frontmatter: FrontmatterMapping,
  body: string,
): Effect.Effect<TasteRecord, CorruptRecordFile> =>
  decodeRecord({ ...frontmatter, ...bodyFields(frontmatter, body) }, { errors: "all", onExcessProperty: "error" }).pipe(
    Effect.mapError((error) => new CorruptRecordFile({ path, problem: error.message })),
  );
