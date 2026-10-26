import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { PlacesPage, PlacesSearch } from "#review/features/places/index.ts";

export const Route = createFileRoute("/places")({
  validateSearch: Schema.toStandardSchemaV1(PlacesSearch),
  component: PlacesPage,
});
