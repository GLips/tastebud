import { createServerFn } from "@tanstack/react-start";
import { DECISION_OUTCOMES } from "@tastebud/core/taste-vocabulary";
import { Schema } from "effect";

import { ScopeOverrideRequestFields } from "#review/shared/review-request-fields.ts";

import { recordOwnerDecision } from "../service/derivation-decisions.ts";

export const decideReviewDerivation = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        ref: Schema.String,
        outcome: Schema.Literals(DECISION_OUTCOMES),
        reason: Schema.optionalKey(Schema.String),
        acknowledges: Schema.optionalKey(Schema.Array(Schema.String)),
        ...ScopeOverrideRequestFields,
      }),
    ),
  )
  .handler(({ data }) => recordOwnerDecision(data));
