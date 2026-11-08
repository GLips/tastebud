import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { loadSourceList } from "../service/source-list.ts";

export const fetchSourceList = createServerFn({ method: "GET" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({ kind: Schema.optionalKey(Schema.Array(Schema.String)), text: Schema.optionalKey(Schema.String) }),
    ),
  )
  .handler(({ data }) => loadSourceList(data));
