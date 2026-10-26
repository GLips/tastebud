/** Validator fields several server functions share. They only shape the wire; each operation decodes strictly. */
import { Schema } from "effect";

export const ContextRequestFields = {
  in: Schema.optionalKey(Schema.String),
  at: Schema.optionalKey(Schema.Array(Schema.String)),
};

export const ScopeOverrideRequestFields = {
  scope: Schema.optionalKey(Schema.Literals(["global", "places"])),
  places: Schema.optionalKey(Schema.Array(Schema.String)),
};
