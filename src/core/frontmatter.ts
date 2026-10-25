import { Effect, Schema } from "effect";
import YAML from "yaml";

import { CorruptRecordFile } from "./errors.ts";
import { type TasteRecord, TasteRecordSchema } from "./records.ts";

/** Fields that live in the markdown body, not the frontmatter. */
const BODY_FIELDS = new Set(["quote", "before", "after", "reasoning", "despite_case", "text"]);

const section = (heading: string, text: string | undefined) =>
  text === undefined ? [] : [`## ${heading}`, "", text.trim(), ""];

const renderBody = (record: TasteRecord): string => {
  switch (record.type) {
    case "Source":
      return [
        ...section("Quote", record.quote),
        ...section("Before", record.before),
        ...section("After", record.after),
      ].join("\n");
    case "Derivation": {
      const reasoning = record.reasoning.trim();
      return [...(reasoning ? [reasoning, ""] : []), ...section("Despite", record.despite_case)].join("\n");
    }
    case "Decision":
      return "";
    case "ThreadEntry":
      return `${record.text.trim()}\n`;
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

/** Splits on `## Heading` lines. Warning: a quote that itself contains such a line is split there too. */
const splitSections = (body: string, headings: ReadonlyArray<string>) => {
  const pattern = new RegExp(`^## (${headings.join("|")})[ \\t]*$`, "m");
  const sections: Record<string, string> = {};
  let lead = "";
  let rest = body;
  let current: string | undefined;
  for (;;) {
    const match = pattern.exec(rest);
    const chunk = match ? rest.slice(0, match.index) : rest;
    if (current === undefined) lead = chunk;
    else sections[current] = chunk.trim();
    if (!match) break;
    current = match[1];
    rest = rest.slice(match.index + match[0].length);
  }
  return { lead: lead.trim(), sections };
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
      if (Reflect.get(frontmatter, "despite") === undefined) return { reasoning: body.trim() };
      const { lead, sections } = splitSections(body, ["Despite"]);
      return { reasoning: lead, ...(nonEmpty(sections["Despite"]) && { despite_case: sections["Despite"] }) };
    }
    case "ThreadEntry":
      return { text: body.trim() };
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
      return decodeRecord(
        { ...frontmatter, ...bodyFields(frontmatter, match[2] ?? "") },
        { errors: "all", onExcessProperty: "error" },
      ).pipe(Effect.mapError((error) => new CorruptRecordFile({ path, problem: error.message })));
    }),
  );
};
