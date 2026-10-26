import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { proposeRepoint } from "../service/places.ts";

export const repointReviewPlace = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ from: Schema.String, to: Schema.String })))
  .handler(({ data }) => proposeRepoint(data));
