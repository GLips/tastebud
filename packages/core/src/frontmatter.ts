import { Effect, Schema } from "effect";
import YAML from "yaml";

import { CorruptRecordFile } from "./errors.ts";
import { type TasteRecord, TasteRecordSchema } from "./records.ts";

/** Fields that live in the markdown body, not the frontmatter. */
const BODY_FIELDS = new Set(["quote", "before", "after", "reasoning", "despite_case", "text"]);

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

/**
 * Frontmatter is written with YAML's default schema so strings like "1" or "true" are quoted for
 * other readers (Obsidian, grep); it is read back with `failsafe`, so nothing is ever coerced.
 */
export const renderRecordFile = (record: TasteRecord): string => {
  const frontmatter: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!BODY_FIELDS.has(key) && value !== undefined) frontmatter[key] = value;
  }
  return `---\n${YAML.stringify(frontmatter)}---\n\n${renderBody(record)}`;
};

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

const bodyFields = (frontmatter: object, body: string): Record<string, unknown> => {
  switch (Reflect.get(frontmatter, "type")) {
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

/** Reads one record file. Frontmatter is parsed `failsafe`, so every scalar arrives as a string. */
export const parseRecordFile = (path: string, content: string): Effect.Effect<TasteRecord, CorruptRecordFile> => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) return Effect.fail(new CorruptRecordFile({ path, problem: "missing YAML frontmatter" }));
  return Effect.try({
    try: (): unknown => YAML.parse(match[1] ?? "", { schema: "failsafe" }),
    catch: (error) => new CorruptRecordFile({ path, problem: String(error) }),
  }).pipe(
    Effect.flatMap((frontmatter) => {
      if (typeof frontmatter !== "object" || frontmatter === null || Array.isArray(frontmatter)) {
        return Effect.fail(new CorruptRecordFile({ path, problem: "frontmatter is not a mapping" }));
      }
      // The renderer puts one blank line between the frontmatter and the body.
      const body = (match[2] ?? "").replace(/^\r?\n/, "");
      return decodeRecord(
        { ...frontmatter, ...bodyFields(frontmatter, body) },
        { errors: "all", onExcessProperty: "error" },
      ).pipe(Effect.mapError((error) => new CorruptRecordFile({ path, problem: error.message })));
    }),
  );
};
