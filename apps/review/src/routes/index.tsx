import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { InboxPage, InboxSearch } from "#review/features/derivation-decisions/index.ts";

export const Route = createFileRoute("/")({
  validateSearch: Schema.toStandardSchemaV1(InboxSearch),
  component: InboxPage,
});
