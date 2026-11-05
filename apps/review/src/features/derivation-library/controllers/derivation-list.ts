import { createServerFn } from "@tanstack/react-start";
import { DERIVATION_STATUSES } from "@tastebud/core/taste-vocabulary";
import { Schema } from "effect";

import { loadDerivationList } from "../service/derivation-list.ts";

export const fetchDerivationList = createServerFn({ method: "GET" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        kind: Schema.optionalKey(Schema.Array(Schema.String)),
        status: Schema.optionalKey(Schema.Literals(DERIVATION_STATUSES)),
        place: Schema.optionalKey(Schema.String),
        text: Schema.optionalKey(Schema.String),
      }),
    ),
  )
  .handler(({ data }) => loadDerivationList(data));
