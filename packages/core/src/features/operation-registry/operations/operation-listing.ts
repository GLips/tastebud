import type { Schema } from "effect";

import type {
  TasteOperationAudience,
  TasteOperationInputSchema,
  TasteOperationKind,
} from "./taste-operation-declaration.ts";
import { TASTE_OPERATIONS, type TasteOperationName } from "./taste-operations.ts";

/** An operation read for what shells list: names, audience, kind, description and schemas, types erased. */
export interface TasteOperationListing {
  readonly name: TasteOperationName;
  readonly audience: TasteOperationAudience;
  readonly kind: TasteOperationKind;
  readonly description: string;
  /** Whether it reads where the caller is (its input has `in`). */
  readonly readsContext: boolean;
  readonly input: TasteOperationInputSchema;
  readonly output: Schema.Top;
}

/** Every operation for one audience, in registry order. MCP lists the `agent` ones as tools. */
export const listTasteOperations = (audience: TasteOperationAudience): ReadonlyArray<TasteOperationListing> =>
  Object.values(TASTE_OPERATIONS).filter((operation) => operation.audience === audience);

/** MCP's tool name for an operation. */
export const mcpToolNameOf = (name: TasteOperationName): string => `tastebud_${name.replaceAll("-", "_")}`;
