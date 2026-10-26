import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { RecallInspectorPage, RecallSearch } from "#review/features/recall-inspector/index.ts";

export const Route = createFileRoute("/recall")({
  validateSearch: Schema.toStandardSchemaV1(RecallSearch),
  component: RecallInspectorPage,
});
