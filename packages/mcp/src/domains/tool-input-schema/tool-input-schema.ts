/**
 * An operation's MCP `inputSchema`: JSON schema generated from its encoded input, with the field
 * descriptions agents read copied back on.
 */
import type { TasteOperationListing } from "@tastebud/core/operations";
import { Schema, SchemaAST } from "effect";

/** Agents read these on every tool that takes them, so they say what to pass, not how it works. */
const CONTEXT_FIELD_DESCRIPTIONS: ReadonlyMap<string, string> = new Map([
  [
    "in",
    "Your working directory, as an absolute path, only when you actually know it: Tastebud resolves it to the project you are in (repo and subdirectory). Leave it out rather than guess.",
  ],
  [
    "at",
    "Place keys to take as where you are, instead of `in` (e.g. github.com/acme/web::apps/checkout). Rarely needed; never combine with `in`.",
  ],
]);

/** An MCP `inputSchema`: a JSON schema whose top level describes an object. */
export type TastebudToolInputJsonSchema = Schema.JsonObject & { readonly type: "object" };

/** Generated JSON schemas are JSON, so this only narrows what the generator's types leave open. */
const isJsonSchemaNode = Schema.is(Schema.Record(Schema.String, Schema.Json));
const isJsonSchemaNodeList = Schema.is(Schema.Array(Schema.Json));

const jsonSchemaNodeOrEmpty = (value: Schema.Json | undefined): Schema.JsonObject =>
  value !== undefined && isJsonSchemaNode(value) ? value : {};

/**
 * Later parts win. Entries rather than spread: the lint can't tell Effect's `JsonObject` interface
 * from a class instance, and the guard's narrowed `Json` has primitive members TypeScript won't spread.
 */
const mergedJsonSchemaNodes = (...parts: ReadonlyArray<Schema.JsonObject>): Schema.JsonObject =>
  Object.fromEntries(parts.flatMap((part) => Object.entries(part)));

/**
 * Optional fields decode from `undefined`, which the generated schema spells as `null`. The decoder
 * refuses `null`, so the schema must not offer it.
 */
const withoutNullAlternatives = (schema: Schema.JsonObject): Schema.JsonObject => {
  const alternatives = schema["anyOf"];
  if (!isJsonSchemaNodeList(alternatives)) return schema;
  const kept = alternatives.filter(isJsonSchemaNode).filter((alternative) => alternative["type"] !== "null");
  const { anyOf: _anyOf, ...rest } = schema;
  const [only, ...others] = kept;
  if (only !== undefined && others.length === 0) return mergedJsonSchemaNodes(only, rest);
  return mergedJsonSchemaNodes(rest, { anyOf: kept });
};

/**
 * The MCP `inputSchema` for an operation. Field descriptions are annotated on the decoded side, so
 * the encoded schema loses them; they are copied back from each field's AST.
 */
export const buildTastebudToolInputSchema = (operation: TasteOperationListing): TastebudToolInputJsonSchema => {
  const fields = Object.entries(operation.input.fields);
  if (fields.length === 0) return { type: "object", properties: {}, additionalProperties: false };
  const document = Schema.toJsonSchemaDocument(operation.input, { onExcessProperty: "error" });
  const generated: Schema.JsonObject = isJsonSchemaNode(document.schema) ? document.schema : {};
  const generatedProperties = jsonSchemaNodeOrEmpty(generated["properties"]);
  const properties = Object.fromEntries(
    fields.map(([key, field]) => {
      const description = CONTEXT_FIELD_DESCRIPTIONS.get(key) ?? SchemaAST.resolveDescription(field.ast);
      const property = withoutNullAlternatives(jsonSchemaNodeOrEmpty(generatedProperties[key]));
      return [key, description === undefined ? property : mergedJsonSchemaNodes(property, { description })];
    }),
  );
  const definitions = Object.fromEntries(
    Object.entries(document.definitions).map(([name, definition]) => [
      name,
      isJsonSchemaNode(definition) ? definition : {},
    ]),
  );
  const extras: Schema.JsonObject =
    Object.keys(definitions).length > 0 ? { properties, $defs: definitions } : { properties };
  return Object.assign(mergedJsonSchemaNodes(generated, extras), { type: "object" as const });
};
