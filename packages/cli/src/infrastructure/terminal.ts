/** stdout, stderr and stdin. */
import { userInfo } from "node:os";

import { Effect } from "effect";

export const printLine = (text: string) => Effect.sync(() => process.stdout.write(`${text}\n`));
export const printErrorLine = (text: string) => Effect.sync(() => process.stderr.write(`${text}\n`));

/** Synchronous writes, for the failure report and the hook, which run outside an Effect. */
export const writeStdout = (text: string) => void process.stdout.write(text);
export const writeStderr = (text: string) => void process.stderr.write(text);

/** All of stdin, as text. Only read on request: an agent's shell may hand over a pipe that never closes. */
export const readStdinText = () => Bun.stdin.text();

/** Whether a person is at the terminal, rather than an agent's shell capturing output. */
export const isInteractiveStdout = () => process.stdout.isTTY;

export const terminalColumns = () => process.stdout.columns ?? 100;
export const terminalRows = () => process.stdout.rows ?? 24;

/** The login name, for `taste init`'s default owner. */
export const currentUserName = () => userInfo().username;
