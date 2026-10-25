/**
 * One command per agent operation, named as the operation is (`taste thread-reply` is MCP's
 * `taste_thread_reply`), plus `init` and `decide`. Each maps its flags, arguments and stdin onto the
 * operation's input and calls `runCliOperation`; help text comes from the operation's description.
 */
import { userInfo } from "node:os";

import { Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { initStore, TASTE_OPERATIONS, type TasteOperationName } from "../core/index.ts";
import { DERIVATION_STATUSES, SAID_AT_PRECISIONS } from "../shared/vocabulary.ts";
import {
  absoluteDirectories,
  actorFlag,
  contextFlags,
  definedFields,
  emitCliResult,
  jsonFlag,
  optionalTextFlag,
  readTextOrStdin,
  repeatableTextFlag,
  resolveCliStoreRoot,
  runCliOperation,
  storeFlag,
} from "./runtime.ts";

const describedAs = (name: TasteOperationName) => Command.withDescription(TASTE_OPERATIONS[name].description);

const kindsFlag = (description: string) => repeatableTextFlag("kind", description);

// ---------------------------------------------------------------------------------------------
// store

export const initCommand = Command.make(
  "init",
  {
    owner: optionalTextFlag("owner", "The human whose taste the store holds, human:<id> (default: human:$USER)"),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ owner, json, store }) =>
    Effect.gen(function* () {
      const root = resolveCliStoreRoot(store);
      const config = yield* initStore(
        root,
        Option.getOrElse(owner, () => `human:${userInfo().username}`),
      );
      yield* emitCliResult(
        json,
        { root, owner: config.owner },
        () => `Created a store at ${root} owned by ${config.owner}. Edit ${root}/taste.config.ts to add kinds.`,
      );
    }),
).pipe(Command.withDescription("Create a store with a commented starter taste.config.ts"));

export const reindexCommand = Command.make("reindex", { json: jsonFlag, store: storeFlag }, ({ json, store }) =>
  runCliOperation("reindex", {}, { store, json }),
).pipe(describedAs("reindex"));

// ---------------------------------------------------------------------------------------------
// reads

export const catalogCommand = Command.make(
  "catalog",
  { ...contextFlags, json: jsonFlag, store: storeFlag },
  ({ json, store, ...flags }) => runCliOperation("catalog", definedFields(flags), { store, json }),
).pipe(describedAs("catalog"));

export const recallCommand = Command.make(
  "recall",
  {
    query: Argument.String("query").pipe(Argument.withDescription("What you are about to decide, in plain words")),
    kind: kindsFlag("A derived kind to search (default: every inject and pull kind)"),
    history: Flag.Boolean("history").pipe(
      Flag.withDescription("Also return superseded and retracted derivations"),
      Flag.withDefault(false),
    ),
    limit: Flag.optional(Flag.Int("limit")).pipe(Flag.withDescription("Most hits per section")),
    ...contextFlags,
    json: jsonFlag,
    store: storeFlag,
  },
  ({ json, store, ...flags }) => runCliOperation("recall", definedFields(flags), { store, json }),
).pipe(
  describedAs("recall"),
  Command.withExamples([
    { command: 'taste recall "styling the admin page"', description: "What applies in this directory" },
    { command: 'taste recall "error handling" --kind insight --in ~/code/web', description: "Another kind, elsewhere" },
  ]),
);

export const recallExplainCommand = Command.make(
  "recall-explain",
  {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("The derivation to explain: an id, short id or unique prefix"),
      Argument.optional,
    ),
    text: optionalTextFlag("text", "Instead of a ref: words from its statement, explaining the closest matches"),
    kind: kindsFlag("A derived kind recall would search (default: every inject and pull kind)"),
    history: Flag.Boolean("history").pipe(
      Flag.withDescription("Explain as recall with --history would"),
      Flag.withDefault(false),
    ),
    ...contextFlags,
    json: jsonFlag,
    store: storeFlag,
  },
  ({ json, store, ...flags }) => runCliOperation("recall-explain", definedFields(flags), { store, json }),
).pipe(
  describedAs("recall-explain"),
  Command.withExamples([
    { command: "taste recall-explain 3f9a2c", description: "Why this derivation does or doesn't reach an agent here" },
    { command: 'taste recall-explain --text "named exports" --in ~/code/web', description: "The closest matches" },
  ]),
);

export const contextCommand = Command.make(
  "context",
  {
    kind: kindsFlag("A derived kind to list (default: every inject kind)"),
    ...contextFlags,
    json: jsonFlag,
    store: storeFlag,
  },
  ({ json, store, ...flags }) => runCliOperation("context", definedFields(flags), { store, json }),
).pipe(describedAs("context"));

export const listCommand = Command.make(
  "list",
  {
    kind: kindsFlag("A kind to list, retired kinds included (default: every derived kind)"),
    status: Flag.optional(Flag.Literals("status", DERIVATION_STATUSES)).pipe(
      Flag.withDescription("Only derivations with this status"),
    ),
    place: optionalTextFlag("place", "Only derivations whose scope applies at this place key"),
    subject: optionalTextFlag("subject", "Only derivations about this subject: owner, or a source account"),
    text: optionalTextFlag("text", "Full-text filter"),
    sources: Flag.Boolean("sources").pipe(Flag.withDescription("Also list sources"), Flag.withDefault(false)),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ json, store, ...flags }) => runCliOperation("list", definedFields(flags), { store, json }),
).pipe(describedAs("list"));

export const showCommand = Command.make(
  "show",
  {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("A full id, the short id from a file name, or a unique prefix"),
    ),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ ref, json, store }) => runCliOperation("show", { ref }, { store, json }),
).pipe(describedAs("show"));

export const placesCommand = Command.make(
  "places",
  {
    probe: repeatableTextFlag("probe", "A directory to audit against (default: the context)"),
    probePlace: repeatableTextFlag("probe-place", "A place key to audit against"),
    ...contextFlags,
    json: jsonFlag,
    store: storeFlag,
  },
  ({ probe, probePlace, json, store, ...flags }) =>
    runCliOperation(
      "places",
      definedFields({ ...flags, probes: absoluteDirectories(probe), probePlaces: probePlace }),
      { store, json },
    ),
).pipe(describedAs("places"));

export const reviewUrlCommand = Command.make(
  "review-url",
  {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("A record to link to (default: the inbox)"),
      Argument.optional,
    ),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ ref, json, store }) => runCliOperation("review-url", definedFields({ ref }), { store, json }),
).pipe(describedAs("review-url"));

/** Opens a URL in the desktop browser; a no-op where there is no desktop to open it on. */
const openInBrowser = (url: string) =>
  Effect.sync(() => {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    Bun.spawn([opener, url], { stdio: ["ignore", "ignore", "ignore"] }).unref();
  });

export const decideCommand = Command.make(
  "decide",
  {
    ref: Argument.String("ref").pipe(Argument.withDescription("The derivation to decide on")),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ ref, json, store }) =>
    Effect.gen(function* () {
      const { url } = yield* runCliOperation("review-url", { ref }, { store, json });
      // Only a person at a terminal wants a browser tab; an agent's shell gets the URL to hand on.
      if (process.stdout.isTTY) yield* openInBrowser(url);
    }),
).pipe(
  Command.withDescription(
    "Open a derivation's review page, where the owner accepts, rejects or retracts it. Writes nothing; prints the URL.",
  ),
);

// ---------------------------------------------------------------------------------------------
// writes

export const captureCommand = Command.make(
  "capture",
  {
    kind: optionalTextFlag("kind", "Source kind (default: the only one, when the catalog has one)"),
    saidBy: Flag.String("said-by").pipe(
      Flag.withDescription("Who said it: a source account, e.g. human:dana or slack:acme/U123"),
    ),
    label: Flag.String("label").pipe(Flag.withDescription("The speaker's display name, e.g. Dana")),
    saidAt: optionalTextFlag("said-at", "When they said it, ISO 8601 with offset (default: now)"),
    precision: Flag.optional(Flag.Literals("precision", SAID_AT_PRECISIONS)).pipe(
      Flag.withDescription("How exact --said-at is (default: inferred from it)"),
    ),
    quote: Flag.String("quote").pipe(Flag.withDescription("Their exact words, verbatim; `-` reads them from stdin")),
    before: optionalTextFlag("before", "What they were reacting to"),
    after: optionalTextFlag("after", "What came right after"),
    address: optionalTextFlag("address", "A permalink to the words"),
    revises: optionalTextFlag("revises", "A source of the same kind these words edit"),
    by: actorFlag,
    ...contextFlags,
    json: jsonFlag,
    store: storeFlag,
  },
  ({ saidBy, label, saidAt, precision, quote, by, json, store, ...flags }) =>
    Effect.gen(function* () {
      const input = definedFields({
        ...flags,
        said_by: saidBy,
        said_by_label: label,
        said_at: saidAt,
        said_at_precision: precision,
        quote: yield* readTextOrStdin(quote),
      });
      yield* runCliOperation("capture", input, { store, json, actor: by });
    }),
).pipe(
  describedAs("capture"),
  Command.withExamples([
    {
      command:
        'taste capture --said-by human:dana --label Dana --quote "No default exports, ever." --by claude-code/2.x',
      description: "Record what the owner just said",
    },
  ]),
);

export const proposeCommand = Command.make(
  "propose",
  {
    kind: Flag.String("kind").pipe(Flag.withDescription("Derived kind, e.g. belief (see `taste catalog`)")),
    statement: Flag.String("statement").pipe(Flag.withDescription("The derivation, one line")),
    supports: Flag.String("supports").pipe(
      Flag.atLeast(1),
      Flag.withDescription(
        "A ref it rests on (repeatable; at least one source of a kind this kind cites, derivations too)",
      ),
    ),
    contradicts: repeatableTextFlag("contradicts", "A ref that cuts against it"),
    supersedes: optionalTextFlag("supersedes", "An accepted derivation of the same kind this revises"),
    despite: repeatableTextFlag("despite", "A blocking near repeat to propose past; name every one, and say --why"),
    why: optionalTextFlag("why", "With --despite: what changed since those matches"),
    reasoning: optionalTextFlag(
      "reasoning",
      "Why the cited words support it, and what would make it wrong; `-` reads stdin",
    ),
    subject: optionalTextFlag("subject", "owner, or the source account whose preference it is"),
    place: repeatableTextFlag("place", "Scope: a place key where it applies, e.g. github.com/acme/web::"),
    global: Flag.Boolean("global").pipe(
      Flag.withDescription("Scope: everywhere (default scope: this repo's root, or this directory)"),
      Flag.withDefault(false),
    ),
    by: actorFlag,
    ...contextFlags,
    json: jsonFlag,
    store: storeFlag,
  },
  ({ why, reasoning, place, by, json, store, ...flags }) =>
    Effect.gen(function* () {
      const input = definedFields({
        ...flags,
        places: place,
        despite_case: why,
        reasoning: Option.isSome(reasoning) ? yield* readTextOrStdin(reasoning.value) : undefined,
      });
      yield* runCliOperation("propose", input, { store, json, actor: by });
    }),
).pipe(
  describedAs("propose"),
  Command.withExamples([
    {
      command:
        'taste propose --kind belief --statement "Use named exports only" --supports 0f3a9c1e --reasoning "They said so twice" --by claude-code/2.x',
      description: "Scope defaults to this repo's root",
    },
    {
      command: 'taste propose … --despite 7b21e0aa --why "They asked again after the rejection"',
      description: "Re-propose past a near repeat",
    },
  ]),
);

export const threadReplyCommand = Command.make(
  "thread-reply",
  {
    derivation: Argument.String("derivation").pipe(
      Argument.withDescription("The derivation whose thread to answer on"),
    ),
    text: Argument.String("text").pipe(Argument.withDescription("Your reply")),
    by: actorFlag,
    json: jsonFlag,
    store: storeFlag,
  },
  ({ derivation, text, by, json, store }) =>
    runCliOperation("thread-reply", { derivation, text }, { store, json, actor: by }),
).pipe(describedAs("thread-reply"));

export const repointCommand = Command.make(
  "repoint",
  {
    from: Flag.String("from").pipe(Flag.withDescription("The exact scope place to replace")),
    to: Flag.String("to").pipe(Flag.withDescription("The place to put in its stead")),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ from, to, json, store }) => runCliOperation("repoint", { from, to }, { store, json }),
).pipe(describedAs("repoint"));

export const repointPreviewCommand = Command.make(
  "repoint-preview",
  {
    from: Flag.String("from").pipe(Flag.withDescription("The exact scope place to replace")),
    to: Flag.String("to").pipe(Flag.withDescription("The place to put in its stead")),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ from, to, json, store }) => runCliOperation("repoint-preview", { from, to }, { store, json }),
).pipe(describedAs("repoint-preview"));

// ---------------------------------------------------------------------------------------------
// hooks and the MCP server

const makeHookPreviewCommand = <const Name extends string>(name: Name) =>
  Command.make(
    name,
    {
      prompt: Argument.String("prompt").pipe(Argument.withDescription("The prompt the hook would see")),
      ...contextFlags,
      json: jsonFlag,
      store: storeFlag,
    },
    ({ json, store, ...flags }) => runCliOperation("hook-preview", definedFields(flags), { store, json }),
  ).pipe(describedAs("hook-preview"));

export const hookPreviewCommand = makeHookPreviewCommand("hook-preview");

const hookPromptCommand = Command.make("prompt", {}, () =>
  Effect.promise(async () => {
    const { runTasteHookPrompt } = await import("./hook-prompt.ts");
    return runTasteHookPrompt();
  }),
).pipe(
  Command.withDescription(
    'Claude Code UserPromptSubmit hook: reads the event JSON on stdin, prints what to inject, always exits 0. Install: {"type":"command","command":"taste hook prompt"}',
  ),
);

export const hookCommand = Command.make("hook").pipe(
  Command.withDescription("Agent hooks: `prompt` to install, `preview` to see what it would inject"),
  Command.withSubcommands([hookPromptCommand, makeHookPreviewCommand("preview")]),
);

export const mcpCommand = Command.make("mcp", { store: storeFlag }, ({ store }) =>
  Effect.promise(async () => {
    const { serveTasteMcpOverStdio } = await import("../mcp/server.ts");
    // Returns once connected; the open stdin keeps the process alive until the client closes it.
    await serveTasteMcpOverStdio(Option.getOrUndefined(store));
  }),
).pipe(
  Command.withDescription(
    "Serve the agent operations as MCP tools over stdio (taste_recall, taste_propose, …). Install: claude mcp add taste -- taste mcp",
  ),
);
