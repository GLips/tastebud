import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { loadRecordDetail } from "../service/review-shell.ts";

export const fetchRecordDetail = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ ref: Schema.String })))
  .handler(({ data }) => loadRecordDetail(data.ref));
