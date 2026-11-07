/** Where a record lives in the store, as "/"-joined paths relative to the root. Pure string work. */
import { shortIdOf, type TasteRecordType } from "#core/domains/taste-vocabulary/index.ts";

import { recordCreatedAt, type TasteRecord } from "./record-schemas.ts";

/** One folder per record type; `kind` lives in frontmatter, never in paths. */
export const RECORD_FOLDERS: Readonly<Record<TasteRecordType, string>> = {
  Source: "sources",
  Derivation: "derivations",
  Decision: "decisions",
  ThreadEntry: "threads",
  CatchUp: "catch-ups",
};

export const slugify = (text: string, maxWords = 6): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, maxWords)
    .join("-")
    .slice(0, 48)
    .replace(/-+$/, "");

/**
 * Sources get no slug, so verbatim words never reach filenames, sync logs or git history. A
 * derivation's statement is an agent's wording, so it may.
 */
const recordSlug = (record: TasteRecord): string => {
  switch (record.type) {
    case "Source":
    case "ThreadEntry":
      return "";
    case "Derivation":
      return slugify(record.statement);
    case "Decision":
      return record.outcome;
    case "CatchUp":
      return record.origin ?? "";
  }
};

/** `<folder>/YYYY/MM/<date>[-<slug>].<short-id>.md`, relative to the store root. */
export const recordRelativePath = (record: TasteRecord, shortId: string): string => {
  const created = recordCreatedAt(record);
  const [year, month] = [created.slice(0, 4), created.slice(5, 7)];
  const slug = recordSlug(record);
  return [
    RECORD_FOLDERS[record.type],
    year,
    month,
    `${created.slice(0, 10)}${slug ? `-${slug}` : ""}.${shortId}.md`,
  ].join("/");
};

/** Picks the 8-char short id, widening it if another file already uses it. */
export const uniqueShortId = (id: string, takenShortIds: ReadonlySet<string>): string => {
  for (let length = 8; length < 20; length += 2) {
    const candidate = shortIdOf(id, length);
    if (!takenShortIds.has(candidate)) return candidate;
  }
  return shortIdOf(id, 20);
};

/** The short id a record file carries in its name: the segment before `.md`. */
export const shortIdFromPath = (path: string): string => {
  const parts = path.split("/").pop()?.split(".") ?? [];
  return parts[parts.length - 2] ?? "";
};
