/**
 * `bun run release <version> --notes <file>`: bumps every place the version is written, runs the gate,
 * commits, and pushes main with an annotated `v<version>` tag whose message is the release notes. The tag
 * starts release.yml, which builds, publishes the GitHub release with those notes, then publishes npm.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { agentHostConnectLinesFor } from "@tastebud/core/agent-hosts";
import { TASTEBUD_VERSION } from "@tastebud/core/taste-vocabulary";
import { Schema } from "effect";

const repoPath = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const VERSION_MODULE = "packages/core/src/domains/taste-vocabulary/tastebud-version.ts";
const PLUGIN_MANIFEST = "plugins/tastebud/.claude-plugin/plugin.json";
const README = "README.md";

const fail = (message: string): never => {
  process.stderr.write(`release: ${message}\n`);
  process.exit(1);
};

const run = (command: string[], options: { quiet?: boolean } = {}) => {
  const result = Bun.spawnSync(command, {
    cwd: repoPath("."),
    stdout: options.quiet ? "pipe" : "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) fail(`${command.join(" ")} exited ${result.exitCode}`);
  return result.stdout?.toString().trim() ?? "";
};

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const semverParts = (version: string) => (SEMVER.exec(version) ?? fail(`${version} is not x.y.z`)).slice(1).map(Number);
const isNewer = (next: string, current: string) => {
  const [a, b] = [semverParts(next), semverParts(current)];
  const differing = a.findIndex((part, index) => part !== b[index]);
  return differing !== -1 && (a[differing] ?? 0) > (b[differing] ?? 0);
};

const { positionals, values } = parseArgs({ allowPositionals: true, options: { notes: { type: "string" } } });
const version = positionals[0] ?? fail("usage: bun run release <x.y.z> --notes <file>");
if (!isNewer(version, TASTEBUD_VERSION)) fail(`${version} is not newer than ${TASTEBUD_VERSION}`);
const notes = readFileSync(
  values.notes ?? fail("--notes <file> is required: it becomes the release body"),
  "utf8",
).trim();
if (notes === "") fail("the notes file is empty");

if (run(["git", "branch", "--show-current"], { quiet: true }) !== "main") fail("releases go from main");
if (run(["git", "status", "--porcelain", "--untracked-files=no"], { quiet: true }) !== "")
  fail("commit or stash tracked changes first");
run(["git", "fetch", "--quiet", "origin", "main"]);
if (run(["git", "rev-parse", "HEAD"], { quiet: true }) !== run(["git", "rev-parse", "origin/main"], { quiet: true }))
  fail("main and origin/main differ: pull or push first");

const rewrite = (path: string, edit: (text: string) => string) => {
  const before = readFileSync(repoPath(path), "utf8");
  const after = edit(before);
  if (after === before) fail(`${path} held no version to bump`);
  writeFileSync(repoPath(path), after);
};

// The README's host lines carry the version inside JSON and a base64 Cursor link, so each old line is
// swapped for the line the bumped module generates rather than patched in place.
const decodeConnectLines = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)));
const oldLines = decodeConnectLines(JSON.stringify(agentHostConnectLinesFor()));
rewrite(VERSION_MODULE, (text) =>
  text.replace(`TASTEBUD_VERSION = "${TASTEBUD_VERSION}"`, `TASTEBUD_VERSION = "${version}"`),
);
rewrite(PLUGIN_MANIFEST, (text) => text.replace(`"version": "${TASTEBUD_VERSION}"`, `"version": "${version}"`));
const newLines = decodeConnectLines(
  run(
    [
      "bun",
      "-e",
      `import { agentHostConnectLinesFor } from "@tastebud/core/agent-hosts"; console.log(JSON.stringify(agentHostConnectLinesFor()))`,
    ],
    {
      quiet: true,
    },
  ),
);
rewrite(README, (text) => {
  let readme = text;
  for (const [key, line] of Object.entries(oldLines)) readme = readme.replaceAll(line, newLines[key] ?? line);
  return readme;
});

run(["bun", "scripts/check.ts"]);
run(["git", "commit", "--quiet", "-m", `Release v${version}`, "--", VERSION_MODULE, PLUGIN_MANIFEST, README]);
run(["git", "tag", "-a", "--cleanup=verbatim", `v${version}`, "-m", notes]);
run(["git", "push", "--atomic", "origin", "main", `v${version}`]);
process.stdout.write(`release: pushed v${version}; release.yml is building it\n`);
