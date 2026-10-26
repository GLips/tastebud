import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { ContextRequestFields } from "#review/shared/review-request-fields.ts";

import { loadRecallInspection } from "../service/recall-inspector.ts";

export const fetchRecallInspection = createServerFn({ method: "GET" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        query: Schema.String,
        kind: Schema.optionalKey(Schema.Array(Schema.String)),
        history: Schema.optionalKey(Schema.Boolean),
        limit: Schema.optionalKey(Schema.Finite),
        ...ContextRequestFields,
      }),
    ),
  )
  .handler(({ data }) => loadRecallInspection(data));
