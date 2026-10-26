import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { loadRepointPreview } from "../service/places.ts";

export const fetchRepointPreview = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ from: Schema.String, to: Schema.String })))
  .handler(({ data }) => loadRepointPreview(data));
