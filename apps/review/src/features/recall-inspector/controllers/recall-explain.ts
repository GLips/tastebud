import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { ContextRequestFields } from "#review/shared/review-request-fields.ts";

import { loadRecallExplanation } from "../service/recall-inspector.ts";

export const fetchRecallExplanation = createServerFn({ method: "GET" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        ref: Schema.optionalKey(Schema.String),
        text: Schema.optionalKey(Schema.String),
        kind: Schema.optionalKey(Schema.Array(Schema.String)),
        history: Schema.optionalKey(Schema.Boolean),
        ...ContextRequestFields,
      }),
    ),
  )
  .handler(({ data }) => loadRecallExplanation(data));
