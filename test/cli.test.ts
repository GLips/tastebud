/** The CLI end to end, as an agent's shell runs it: a real process, a temp store, a real git repo. */
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Schema } from "effect";

import {
  AGENT,
  demoConfigText,
  makeGitRepo,
  makeTemporaryDirectory,
  makeTestStore,
  OWNER,
  runTastebud,
} from "./support.ts";

/** Decoders for the `--json` fields these tests read; other fields pass through unchecked. */
const decodeCapturedJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ source: Schema.Struct({ source: Schema.Struct({ id: Schema.String }) }) })),
);
const decodeProposedJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ derivation: Schema.Struct({ id: Schema.String, proposedScope: Schema.Unknown }) }),
  ),
);
const decodeFailureJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      error: Schema.Struct({
        tag: Schema.String,
        category: Schema.String,
        matches: Schema.optionalKey(Schema.Array(Schema.Unknown)),
      }),
    }),
  ),
);
const decodeContextJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      context: Schema.Unknown,
      sources: Schema.optionalKey(Schema.Array(Schema.Struct({ source: Schema.Struct({ id: Schema.String }) }))),
    }),
  ),
);

const countRecordFiles = (store: string) =>
  readdirSync(store, { recursive: true }).filter((path) => String(path).endsWith(".md")).length;

test("capture, propose and recall --json from a repo; a repeat exits 3 and open writes nothing", async () => {
  const store = await makeTestStore();
  const repo = makeGitRepo("git@github.com:acme/web.git", ["apps/checkout"]);
  const checkout = join(repo, "apps/checkout");

  const captured = await runTastebud(store, checkout, [
    "capture",
    "--said-by",
    OWNER,
    "--label",
    "Tess",
    "--quote",
    "No default exports, ever.",
    "--by",
    AGENT,
    "--json",
  ]);
  expect(captured.exitCode).toBe(0);
  const sourceId = decodeCapturedJson(captured.stdout).source.source.id;

  const proposeArgs = ["propose", "--kind", "belief", "--statement", "Use named exports, never default exports"];
  proposeArgs.push("--supports", sourceId, "--reasoning", "She said so outright.", "--by", AGENT, "--json");
  const proposed = await runTastebud(store, checkout, proposeArgs);
  expect(proposed.exitCode).toBe(0);
  const { derivation } = decodeProposedJson(proposed.stdout);
  // Proposed from a subdirectory, the defaulted scope is the repo root.
  expect(derivation.proposedScope).toEqual({ scope: "places", places: ["github.com/acme/web::"] });

  const repeated = await runTastebud(store, checkout, proposeArgs);
  expect(repeated.exitCode).toBe(3);
  const { error } = decodeFailureJson(repeated.stdout);
  expect([error.tag, error.category, error.matches?.length]).toEqual(["NearRepeat", "refused", 1]);

  const recalled = await runTastebud(store, repo, ["recall", "default exports", "--json"]);
  expect(recalled.exitCode).toBe(0);
  const recall = decodeContextJson(recalled.stdout);
  expect(recall.context).toMatchObject({ origin: "cwd", places: ["github.com/acme/web::"] });
  expect(recall.sources?.map((hit) => hit.source.id)).toContain(sourceId);

  const before = countRecordFiles(store);
  const opened = await runTastebud(store, repo, ["open", derivation.id]);
  expect(opened.exitCode).toBe(0);
  expect(opened.stdout.trim()).toEndWith(`/derivations/${derivation.id}`);
  expect(opened.stderr).toContain("No review server is running for this store");
  expect(countRecordFiles(store)).toBe(before);
});

test("--at says where the caller is, so a cwd the resolver can't read never runs", async () => {
  const store = await makeTestStore(demoConfigText(`() => { throw new Error("no place here"); }`));
  const cwd = makeTemporaryDirectory("anywhere");
  const broken = await runTastebud(store, cwd, ["catalog", "--json"]);
  expect(decodeFailureJson(broken.stdout).error.tag).toBe("PlaceResolutionFailed");
  const placed = await runTastebud(store, cwd, ["catalog", "--at", "clients/acme", "--json"]);
  expect(placed.exitCode).toBe(0);
  expect(decodeContextJson(placed.stdout).context).toMatchObject({ origin: "at", places: ["clients/acme"] });
});

test("config-write creates a store from nothing for catalog to read, and refuses a stale expected_current", async () => {
  const cwd = makeTemporaryDirectory("setup");
  const store = join(cwd, "store");
  const missing = await runTastebud(store, cwd, ["catalog", "--json"]);
  expect([missing.exitCode, decodeFailureJson(missing.stdout).error.tag]).toEqual([2, "StoreNotInitialised"]);

  const text = demoConfigText(`"directories"`);
  const created = await runTastebud(store, cwd, ["config-write", "--text", text, "--expected-current", ""]);
  expect(created.exitCode).toBe(0);
  const catalog = await runTastebud(store, cwd, ["catalog"]);
  expect(catalog.stdout).toContain(`owner ${OWNER} · resolver directories`);

  // The agent believed there was no store; there is one now, so the write must not clobber it.
  const edited = text.replace("limit: 3", "limit: 5");
  const stale = await runTastebud(store, cwd, ["config-write", "--text", edited, "--expected-current", "", "--json"]);
  expect([stale.exitCode, decodeFailureJson(stale.stdout).error.tag]).toEqual([4, "StaleTastebudConfig"]);
  expect(readFileSync(join(store, "tastebud.config.ts"), "utf8")).toBe(text);
});

test("catalog --guide leads with the curator procedure, then this store's own kinds and prompts", async () => {
  const store = await makeTestStore(demoConfigText(`"directories"`));
  const cwd = makeTemporaryDirectory("curate");
  const guided = await runTastebud(store, cwd, ["catalog", "--guide"]);
  expect(guided.exitCode).toBe(0);
  const plain = await runTastebud(store, cwd, ["catalog"]);
  expect(guided.stdout.startsWith("# Review the owner's saved words")).toBe(true);
  expect(guided.stdout).toEndWith(plain.stdout);
  expect(plain.stdout).not.toContain("Review the owner's saved words");
});

/** `tastebud <command>` and `tastebud <group> <sub>` spellings in a guide's code spans and blocks. */
const commandsNamedIn = (guide: string) =>
  new Set(
    [...guide.matchAll(/tastebud ([a-z][a-z-]+)(?: (prompt|preview|listen)\b)?/g)].map((m) =>
      m.slice(1, 3).filter(Boolean).join(" "),
    ),
  );

test("every tastebud command the setup and curator guides tell an agent to run exists", async () => {
  const store = await makeTestStore(demoConfigText(`"directories"`));
  const cwd = makeTemporaryDirectory("guides");
  const setup = await runTastebud(store, cwd, ["config-show", "--guide"]);
  const curator = await runTastebud(store, cwd, ["catalog", "--guide"]);
  const named = new Set([...commandsNamedIn(setup.stdout), ...commandsNamedIn(curator.stdout)]);
  expect(named).toContain("hook preview");
  expect(named).toContain("review-url");
  expect(named).toContain("transcript-candidates");
  const helps = await Promise.all(
    [...named].map(async (command) => ({
      command,
      help: await runTastebud(store, cwd, [...command.split(" "), "--help"]),
    })),
  );
  const missing = helps.filter(
    ({ command, help }) => help.exitCode !== 0 || !help.stdout.includes(`tastebud ${command}`),
  );
  expect(missing.map(({ command }) => command)).toEqual([]);
});
