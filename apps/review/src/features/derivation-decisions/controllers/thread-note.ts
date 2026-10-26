import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { recordOwnerThreadNote } from "../service/derivation-decisions.ts";

export const postOwnerThreadNote = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ ref: Schema.String, text: Schema.String })))
  .handler(({ data }) => recordOwnerThreadNote(data));
