import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { ScopeOverrideRequestFields } from "#review/shared/review-request-fields.ts";

import { loadAcceptPreview } from "../service/derivation-decisions.ts";

export const fetchAcceptPreview = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ ref: Schema.String, ...ScopeOverrideRequestFields })))
  .handler(({ data }) => loadAcceptPreview(data));
