import { DERIVATION_STATUSES } from "@tastebud/core/taste-vocabulary";
/** Commands that read: one per query operation, plus `open`. */
import { Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { openInBrowser } from "#cli/infrastructure/browser-opener.ts";
import { isInteractiveStdout } from "#cli/infrastructure/terminal.ts";
import {
  contextFlags,
  definedFields,
  jsonFlag,
  kindsFlag,
  optionalTextFlag,
  repeatableTextFlag,
  storeFlag,
} from "#cli/shared/cli-flags.ts";

import { describedAs, runCliOperation } from "./run-cli-operation.ts";

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
    { command: 'tastebud recall "styling the admin page"', description: "What applies in this directory" },
    {
      command: 'tastebud recall "error handling" --kind insight --in ~/code/web',
      description: "Another kind, elsewhere",
    },
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
    {
      command: "tastebud recall-explain 3f9a2c",
      description: "Why this derivation does or doesn't reach an agent here",
    },
    { command: 'tastebud recall-explain --text "named exports" --in ~/code/web', description: "The closest matches" },
  ]),
);

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
    runCliOperation("places", definedFields({ ...flags, probes: probe, probe_places: probePlace }), { store, json }),
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

export const openCommand = Command.make(
  "open",
  {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("A record to open (default: the inbox)"),
      Argument.optional,
    ),
    json: jsonFlag,
    store: storeFlag,
  },
  ({ ref, json, store }) =>
    Effect.gen(function* () {
      const { url } = yield* runCliOperation("review-url", definedFields({ ref }), { store, json });
      // Only a person at a terminal wants a browser tab; an agent's shell gets the URL to hand on.
      if (isInteractiveStdout()) yield* openInBrowser(url);
    }),
).pipe(
  Command.withDescription(
    "Open the review page (the inbox, or one record), where the owner accepts, rejects or retracts. Writes nothing; prints the URL.",
  ),
);

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
