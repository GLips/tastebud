/** The cross-process lock every decision write holds, as a `wx`-created file under `.index/`. */
import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeSync } from "node:fs";
import { join } from "node:path";

import { Effect, Predicate } from "effect";

import { indexDirOf } from "./record-files.ts";
import { DecisionLockTimeout, StoreWriteFailed } from "./store-errors.ts";

const LOCK_WAIT_MS = 5_000;

/** A Node system error's `code` (`ENOENT`, `EEXIST`, …), read off a caught value. */
const errorCodeOf = (cause: unknown): string | undefined =>
  Predicate.hasProperty(cause, "code") && Predicate.isString(cause.code) ? cause.code : undefined;

/** Whether `pid` is a running process. EPERM means it exists under another user. */
const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCodeOf(error) === "EPERM";
  }
};

const readLockFile = (path: string) => {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (errorCodeOf(error) === "ENOENT") return undefined;
    throw error;
  }
};

/**
 * A held lock is stale only when its holder's pid is dead. A lock with no readable pid (a holder
 * that crashed between create and write) is stale once it is older than the wait.
 */
const isStaleLock = (path: string, content: string) => {
  const pid = Number(content.split(" ")[0]);
  if (Number.isInteger(pid) && pid > 0) return !isProcessAlive(pid);
  const held = statSync(path, { throwIfNoEntry: false });
  return held !== undefined && Date.now() - held.mtimeMs > LOCK_WAIT_MS;
};

/**
 * Invariant: only the holder of the exclusively created `decide.lock.takeover` sidecar deletes
 * another process's lock, and only after re-reading the same stale content under it, so a lock
 * created since is never removed. Nothing is moved or restored. A process killed inside this window
 * leaves the sidecar; decisions then time out naming the lock until someone deletes it.
 */
const removeStaleLock = (path: string, staleContent: string) => {
  const sidecar = `${path}.takeover`;
  let fd: number;
  try {
    fd = openSync(sidecar, "wx");
  } catch (error) {
    if (errorCodeOf(error) === "EEXIST") return;
    throw error;
  }
  try {
    if (readLockFile(path) === staleContent) rmSync(path, { force: true });
  } finally {
    closeSync(fd);
    rmSync(sidecar, { force: true });
  }
};

/** One attempt: true when this process now holds the lock under `token`. */
const tryCreateLock = (path: string, token: string): boolean => {
  try {
    const fd = openSync(path, "wx");
    try {
      writeSync(fd, token);
    } finally {
      closeSync(fd);
    }
    return true;
  } catch (error) {
    if (errorCodeOf(error) !== "EEXIST") throw error;
    const content = readLockFile(path);
    if (content !== undefined && isStaleLock(path, content)) removeStaleLock(path, content);
    return false;
  }
};

/** Removes the lock only if it is still ours. */
const releaseLock = (path: string, token: string) => {
  if (readLockFile(path) === token) rmSync(path, { force: true });
};

/**
 * Runs `use` holding `.index/decide.lock`, so the state recheck and the write are atomic across
 * processes: two accepts of revisions superseding the same target can't both land. The lock file
 * holds `<pid> <token>`, so only a dead holder's lock is taken over and release never removes
 * another process's lock.
 */
export const withDecisionLock = <A, E, R>(
  root: string,
  use: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | DecisionLockTimeout | StoreWriteFailed, R> => {
  const lockPath = join(indexDirOf(root), "decide.lock");
  const token = `${process.pid} ${randomUUID()}\n`;
  const attempt = Effect.try({
    try: () => {
      mkdirSync(indexDirOf(root), { recursive: true });
      return tryCreateLock(lockPath, token);
    },
    catch: (error) => new StoreWriteFailed({ path: lockPath, problem: String(error) }),
  });
  const acquire = Effect.gen(function* () {
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (!(yield* attempt)) {
      if (Date.now() > deadline) return yield* new DecisionLockTimeout({ lockPath });
      yield* Effect.sleep("20 millis");
    }
  });
  return Effect.acquireUseRelease(
    acquire,
    () => use,
    () => Effect.sync(() => releaseLock(lockPath, token)),
  );
};
