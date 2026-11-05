/**
 * The store's files on disk: exclusive record writes, atomic sidecar writes and the record folder walk.
 * Paths below the root are the "/"-joined relative paths the records domain builds.
 */
import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { Effect } from "effect";

import { StoreWriteFailed } from "./store-errors.ts";

export const INDEX_DIR = ".index";

export const indexDirOf = (root: string) => join(root, INDEX_DIR);

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

/** For the store's mutable files: `taste.config.ts` and `.index/` sidecars. Rename keeps readers from seeing half a file. */
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

/** A store-relative path as an absolute one. */
export const storeFilePath = (root: string, relativePath: string) => join(root, relativePath);

/** A store file's text, read whole. */
export const readStoreFileText = (root: string, relativePath: string) => readFileSync(join(root, relativePath), "utf8");

/** Whether a store-relative path exists. */
export const storeFileExists = (root: string, relativePath: string) => existsSync(join(root, relativePath));

export interface StoreFileStat {
  readonly path: string;
  readonly mtimeMs: number;
}

/** Every `.md` file under `folders`, relative to the root and "/"-joined. `.index/` is never walked. */
export const listRecordFiles = (root: string, folders: ReadonlyArray<string>): Array<StoreFileStat> => {
  const files: Array<StoreFileStat> = [];
  const walk = (directory: string) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push({ path: relative(root, full).split(sep).join("/"), mtimeMs: statSync(full).mtimeMs });
      }
    }
  };
  for (const folder of folders) walk(join(root, folder));
  return files.sort((left, right) => left.path.localeCompare(right.path));
};
