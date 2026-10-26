import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { SourceListPage, SourceListSearch } from "#review/features/sources/index.ts";

export const Route = createFileRoute("/sources/")({
  validateSearch: Schema.toStandardSchemaV1(SourceListSearch),
  component: SourceListPage,
});
