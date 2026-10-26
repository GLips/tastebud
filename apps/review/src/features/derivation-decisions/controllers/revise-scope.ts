import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { recordScopeRevision } from "../service/derivation-decisions.ts";

export const proposeScopeRevision = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        ref: Schema.String,
        scope: Schema.Literals(["global", "places"]),
        places: Schema.optionalKey(Schema.Array(Schema.String)),
        despite: Schema.optionalKey(Schema.Array(Schema.String)),
        despite_case: Schema.optionalKey(Schema.String),
      }),
    ),
  )
  .handler(({ data }) => recordScopeRevision(data));
