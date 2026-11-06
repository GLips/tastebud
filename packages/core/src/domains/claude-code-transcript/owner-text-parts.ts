/**
 * The words a person typed in a Claude Code message, with what Claude Code wrapped around or into
 * them taken out. A wrapper is an element that opens at the start of a line and closes later in the
 * same text; a tag inside a line, or one never closed, is the person's own text.
 */

/**
 * Wrappers Claude Code writes into user-role text: reminders, pasted content, local and bash command
 * echoes, notifications, and the slash-command header. Their text is never the person's sentence.
 */
const DROPPED_WRAPPERS: ReadonlySet<string> = new Set([
  "system-reminder",
  "pasted_content",
  "local-command-stdout",
  "local-command-stderr",
  "local-command-caveat",
  "bash-input",
  "bash-stdout",
  "bash-stderr",
  "task-notification",
  "user-prompt-submit-hook",
  "command-message",
  "command-name",
  "command-args",
]);

const WRAPPER_OPENING = /^[ \t]*<([A-Za-z][\w-]*)(?:\s[^>\n]*)?>/gm;

const closingTagAfter = (text: string, name: string, from: number) => {
  const closing = new RegExp(`</${name}(?:\\s[^>]*)?>`, "g");
  closing.lastIndex = from;
  const found = closing.exec(text);
  return found === null ? undefined : found.index + found[0].length;
};

/** Either the person's text split where wrappers were cut out, or the first unknown wrapper. */
export type OwnerTextParts =
  | { readonly status: "parts"; readonly parts: ReadonlyArray<string> }
  | { readonly status: "unknown-wrapper"; readonly wrapper: string };

/** `text` without its known wrappers, as trimmed non-blank parts; an unknown wrapper refuses it all. */
export const ownerTextPartsOf = (text: string): OwnerTextParts => {
  const segments: Array<string> = [];
  let kept = 0;
  const opening = new RegExp(WRAPPER_OPENING.source, WRAPPER_OPENING.flags);
  for (let found = opening.exec(text); found !== null; found = opening.exec(text)) {
    const name = found[1] ?? "";
    const end = closingTagAfter(text, name, found.index + found[0].length);
    if (end === undefined) continue;
    if (!DROPPED_WRAPPERS.has(name)) return { status: "unknown-wrapper", wrapper: name };
    segments.push(text.slice(kept, found.index));
    kept = end;
    opening.lastIndex = end;
  }
  segments.push(text.slice(kept));
  return { status: "parts", parts: segments.map((segment) => segment.trim()).filter((segment) => segment !== "") };
};

const SLASH_COMMAND_HEADER = /^\s*<command-(?:message|name)>/;
const COMMAND_NAME = /<command-name>([^<]*)<\/command-name>/;
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/;

/** Whether `text` is how Claude Code records a slash command the person ran. */
export const isSlashCommandText = (text: string): boolean => SLASH_COMMAND_HEADER.test(text);

/** A slash command's name and the arguments typed after it; only the arguments are the person's words. */
export const slashCommandOf = (text: string) => ({
  name: COMMAND_NAME.exec(text)?.[1]?.trim() ?? "",
  args: COMMAND_ARGS.exec(text)?.[1] ?? "",
});
