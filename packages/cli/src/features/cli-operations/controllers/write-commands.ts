import { SAID_AT_PRECISIONS } from "@tastebud/core/taste-vocabulary";
/** Commands that append records, each acting as `--by` where the operation records an agent. */
import { Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import {
  actorFlag,
  contextFlags,
  definedFields,
  jsonFlag,
  optionalTextFlag,
  repeatableTextFlag,
  storeFlag,
} from "#cli/shared/cli-flags.ts";

import { describedAs, readTextOrStdin, runCliOperation } from "./run-cli-operation.ts";

export const captureCommand = Command.make(
  "capture",
  {
    kind: optionalTextFlag("kind", "Source kind (default: the config's conversationSourceKind)"),
    saidBy: Flag.String("said-by").pipe(
      Flag.withDescription('Who said it: "owner", else a source account, e.g. human:dana or slack:acme/U123'),
    ),
    label: optionalTextFlag("label", "The speaker's display name, e.g. Dana (default for owner: ownerName)"),
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
      command: 'tastebud capture --said-by owner --quote "No default exports, ever." --by claude-code/2.x',
      description: "Record what the owner just said",
    },
  ]),
);

/** `--global` and `--place` are the CLI's spelling of the one scope shape core takes. Neither leaves core's default scope. */
const proposeScopeFlagOf = (global: boolean, places: ReadonlyArray<string>): "global" | "places" | undefined => {
  if (global) return "global";
  if (places.length > 0) return "places";
  return undefined;
};

export const proposeCommand = Command.make(
  "propose",
  {
    kind: Flag.String("kind").pipe(Flag.withDescription("Derived kind, e.g. belief (see `tastebud catalog`)")),
    statement: Flag.String("statement").pipe(Flag.withDescription("The derivation, one line")),
    supports: Flag.String("supports").pipe(
      Flag.atLeast(1),
      Flag.withDescription(
        "A ref it rests on (repeatable; at least one source of a kind this kind cites, derivations too)",
      ),
    ),
    contradicts: repeatableTextFlag("contradicts", "A ref that cuts against it"),
    supersedes: optionalTextFlag("supersedes", "An accepted derivation of the same kind this revises"),
    despite: repeatableTextFlag(
      "despite",
      "A blocking near repeat to propose past; name every one, and say --despite-case",
    ),
    despiteCase: optionalTextFlag("despite-case", "With --despite: what changed since those matches"),
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
  ({ despiteCase, reasoning, place, global, by, json, store, ...flags }) =>
    Effect.gen(function* () {
      const input = definedFields({
        ...flags,
        scope: proposeScopeFlagOf(global, place),
        places: place,
        despite_case: despiteCase,
        reasoning: Option.isSome(reasoning) ? yield* readTextOrStdin(reasoning.value) : undefined,
      });
      yield* runCliOperation("propose", input, { store, json, actor: by });
    }),
).pipe(
  describedAs("propose"),
  Command.withExamples([
    {
      command:
        'tastebud propose --kind belief --statement "Use named exports only" --supports 0f3a9c1e --reasoning "They said so twice" --by claude-code/2.x',
      description: "Scope defaults to this repo's root",
    },
    {
      command: 'tastebud propose … --despite 7b21e0aa --despite-case "They asked again after the rejection"',
      description: "Re-propose past a near repeat",
    },
  ]),
);

export const threadReplyCommand = Command.make(
  "thread-reply",
  {
    ref: Argument.String("ref").pipe(Argument.withDescription("The derivation whose thread to answer on")),
    text: Argument.String("text").pipe(Argument.withDescription("Your reply")),
    by: actorFlag,
    json: jsonFlag,
    store: storeFlag,
  },
  ({ ref, text, by, json, store }) => runCliOperation("thread-reply", { ref, text }, { store, json, actor: by }),
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
