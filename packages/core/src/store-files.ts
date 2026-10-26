import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import { Effect } from "effect";

import { StoreWriteFailed } from "./errors.ts";
import { slugify } from "./ids.ts";
import { recordCreatedAt, type TasteRecord } from "./records.ts";
import { shortIdOf, type TasteRecordType } from "./shared/vocabulary.ts";

export const INDEX_DIR = ".index";

export const indexDirOf = (root: string) => join(root, INDEX_DIR);

/** One folder per record type; `kind` lives in frontmatter, never in paths. */
const RECORD_FOLDERS: Record<TasteRecordType, string> = {
  Source: "sources",
  Derivation: "derivations",
  Decision: "decisions",
  ThreadEntry: "threads",
};

/**
 * Exclusive create: a store file is written once and never edited, so an existing path is an error.
 * Written to a temp file and hard-linked into place, because a polling reader (the listener, the UI)
 * would otherwise see an empty file between `open` and `write` and report it corrupt.
 */
export const writeFileExclusive = (path: string, content: string): Effect.Effect<void, StoreWriteFailed> =>
  Effect.try({
    try: () => {
      mkdirSync(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      const fd = openSync(temporary, "wx");
      try {
        writeSync(fd, content);
      } finally {
        closeSync(fd);
      }
      try {
        linkSync(temporary, path);
      } finally {
        unlinkSync(temporary);
      }
    },
    catch: (error) => new StoreWriteFailed({ path, problem: String(error) }),
  });

/** For mutable sidecar files under `.index/` only (listener cursors). Rename keeps readers from seeing half a file. */
export const writeFileAtomicSync = (path: string, content: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  const fd = openSync(temporary, "w");
  try {
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
};

/** `<folder>/YYYY/MM/<date>[-<slug>].<short-id>.md`, relative to the store root. */
export const recordRelativePath = (record: TasteRecord, shortId: string): string => {
  const created = recordCreatedAt(record);
  const [year, month] = [created.slice(0, 4), created.slice(5, 7)];
  const slug = recordSlug(record);
  return join(
    RECORD_FOLDERS[record.type],
    year,
    month,
    `${created.slice(0, 10)}${slug ? `-${slug}` : ""}.${shortId}.md`,
  );
};

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
  }
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

export interface StoreFileStat {
  readonly path: string;
  readonly mtimeMs: number;
}

/** Every record file, relative to the root. Only the four record folders are walked; `.index/` never is. */
export const listRecordFiles = (root: string): Array<StoreFileStat> => {
  const files: Array<StoreFileStat> = [];
  const walk = (directory: string) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push({ path: relative(root, full), mtimeMs: statSync(full).mtimeMs });
      }
    }
  };
  for (const folder of Object.values(RECORD_FOLDERS)) walk(join(root, folder));
  return files.sort((left, right) => left.path.localeCompare(right.path));
};
