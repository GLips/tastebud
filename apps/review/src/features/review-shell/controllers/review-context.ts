import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { ContextRequestFields } from "#review/shared/review-request-fields.ts";

import { loadReviewContext } from "../service/review-shell.ts";

export const resolveReviewContext = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct(ContextRequestFields)))
  .handler(({ data }) => loadReviewContext(data));
