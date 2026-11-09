/**
 * Agent hosts' own config files, read only: where each lives on this machine, and its contents parsed as
 * JSON or TOML and decoded. A missing file and one that won't parse are results, not failures, so one bad file
 * leaves the other hosts' readouts standing.
 */
import { join } from "node:path";

import { Effect, Option, Schema } from "effect";

import { readClaudeConfigDirVariable } from "#core/env.ts";

import { homeDirectory } from "./home-directory.ts";

export type HostConfigFileRead<A> =
  | { readonly found: "missing" }
  | { readonly found: "unreadable" }
  | { readonly found: "parsed"; readonly value: A };

/** VS Code's user settings folder per platform; Windows' lives under `%APPDATA%`, which Tastebud doesn't read. */
const VSCODE_USER_DIRECTORIES: Partial<Record<NodeJS.Platform, (home: string) => string>> = {
  darwin: (home) => join(home, "Library", "Application Support", "Code", "User"),
  linux: (home) => join(home, ".config", "Code", "User"),
};

/** Where each host keeps the config Tastebud's entry goes in; VS Code's is unknown off macOS and Linux. */
export const agentHostConfigPaths = () => {
  const home = homeDirectory();
  const vscodeUser = VSCODE_USER_DIRECTORIES[process.platform]?.(home);
  return {
    home,
    claudeCodeSettings: join(readClaudeConfigDirVariable() ?? join(home, ".claude"), "settings.json"),
    // Codex honours CODEX_HOME too; Tastebud reads only its default home, so a moved one reads as missing.
    codexConfig: join(home, ".codex", "config.toml"),
    cursorMcp: join(home, ".cursor", "mcp.json"),
    vscodeMcp: vscodeUser === undefined ? undefined : join(vscodeUser, "mcp.json"),
  };
};

/**
 * One host config file, parsed as `format` and decoded with the caller's `schema`. A file that can't be read,
 * parsed or decoded is unreadable: the readout says "can't tell" rather than guessing.
 */
export const readAgentHostConfigFile = <A>(path: string, format: "json" | "toml", schema: Schema.Decoder<A>) =>
  Effect.promise(async (): Promise<HostConfigFileRead<A>> => {
    const file = Bun.file(path);
    if (!(await file.exists())) return { found: "missing" };
    try {
      const text = await file.text();
      const decoded = Schema.decodeUnknownOption(schema)(format === "json" ? JSON.parse(text) : Bun.TOML.parse(text));
      return Option.isSome(decoded) ? { found: "parsed", value: decoded.value } : { found: "unreadable" };
    } catch {
      return { found: "unreadable" };
    }
  });
