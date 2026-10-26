import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { KindLibraryPage, KindLibrarySearch } from "#review/features/derivation-library/index.ts";

export const Route = createFileRoute("/kinds/$kind")({
  validateSearch: Schema.toStandardSchemaV1(KindLibrarySearch),
  component: KindLibraryPage,
});
