import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { loadPlacesAudit } from "../service/places.ts";

export const fetchPlacesAudit = createServerFn({ method: "GET" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        probes: Schema.optionalKey(Schema.Array(Schema.String)),
        probe_places: Schema.optionalKey(Schema.Array(Schema.String)),
      }),
    ),
  )
  .handler(({ data }) => loadPlacesAudit(data));
