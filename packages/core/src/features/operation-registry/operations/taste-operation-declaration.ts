/**
 * What one operation declares: its input and output schemas, audience, kind, description and text
 * rendering. The CLI, MCP and the review server are thin adapters over these declarations.
 */
import { Effect, Schema } from "effect";

import type { TasteCaller } from "#core/domains/taste-caller/index.ts";
import type { TasteStore, TasteStoreRoot } from "#core/features/record-store/index.server.ts";
import { OptionalTrimmedText, OptionalTrimmedTextList } from "#core/shared/input-text.ts";
import { InvalidTasteInput } from "#core/shared/invalid-taste-input.ts";
import { formatSchemaProblems } from "#core/shared/schema-problems.ts";

import type { TasteError } from "./taste-error.ts";

/**
 * Every service an operation may require. `provideTasteStore(root)` provides both; the config
 * operations need only `TasteStoreRoot`, so they run where no store exists yet.
 */
export type TasteServices = TasteStore | TasteStoreRoot;

/** `agent` operations are on the CLI and MCP; `human` ones only behind the review server and the seed. */
export type TasteOperationAudience = "agent" | "human";
/** A query only reads; a command appends records (or rebuilds the index); an overwrite replaces `tastebud.config.ts`. */
export type TasteOperationKind = "query" | "command" | "overwrite";

/** An operation's input is a struct, so its encoded form is an object a JSON schema can describe. */
export type TasteOperationInputSchema = Schema.Struct<Schema.Struct.Fields>;

/**
 * An operation's input as a shell hands it over, before decoding: JSON-shaped fields from MCP
 * arguments, CLI flags, a review request, or the seed's literals.
 */
export interface TasteOperationWireInput {
  readonly [field: string]: Schema.Json | undefined;
}

/** An output is a struct too: MCP's `structuredContent` must be an object. */
export type TasteOperationOutputSchema = Schema.Struct<Schema.Struct.Fields>;

export interface TasteOperationDeclaration<
  Name extends string,
  Input extends TasteOperationInputSchema,
  Output extends TasteOperationOutputSchema,
  E extends TasteError,
  R extends TasteServices,
> {
  /** CLI `tastebud <name>`; MCP tool `tastebud_<name>` with `-` as `_`. */
  readonly name: Name;
  readonly audience: TasteOperationAudience;
  readonly kind: TasteOperationKind;
  /** MCP's tool description and the CLI's help line. */
  readonly description: string;
  readonly input: Input;
  readonly output: Output;
  readonly run: (input: Input["Type"], caller: TasteCaller) => Effect.Effect<Output["Type"], E, R>;
  /** The text the CLI prints and MCP returns, so both say the same thing. */
  readonly renderText: (output: Output["Type"]) => string;
}

/** Every issue at once, and no unknown fields, so a caller fixes its input in one round. */
const OPERATION_INPUT_DECODING = { errors: "all", onExcessProperty: "error" } as const;

/** Keeps a declaration's literal name and types, and adds the decode-then-run every adapter calls. */
export const declareTasteOperation = <
  const Name extends string,
  Input extends TasteOperationInputSchema,
  Output extends TasteOperationOutputSchema,
  E extends TasteError,
  R extends TasteServices,
>(
  declaration: TasteOperationDeclaration<Name, Input, Output, E, R>,
) => ({
  ...declaration,
  /** Whether the operation reads where the caller is, so a shell must resolve the caller's context. */
  readsContext: Object.hasOwn(declaration.input.fields, "in"),
  /** For input as it crossed a wire or a flag parser: decoded whole, transformations included. */
  decodeAndRun: (input: TasteOperationWireInput, caller: TasteCaller) =>
    Schema.decodeUnknownEffect(declaration.input)(input, OPERATION_INPUT_DECODING).pipe(
      Effect.mapError((error) => new InvalidTasteInput({ problems: formatSchemaProblems(error) })),
      Effect.flatMap((decoded) => declaration.run(decoded, caller)),
      Effect.withSpan(`operation-registry.${declaration.name}`),
    ),
});

/** The `in` / `at` input every context-reading operation without its own fields takes. */
export const ContextOverrideInputSchema = Schema.Struct({
  in: OptionalTrimmedText.annotate({ description: "Resolve the context as if in this directory" }),
  at: OptionalTrimmedTextList.annotate({ description: "Take these places as the context" }),
});
export const NoInput = Schema.Struct({});
