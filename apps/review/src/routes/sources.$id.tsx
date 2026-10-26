import { createFileRoute } from "@tanstack/react-router";

import { SourcePage } from "#review/features/sources/index.ts";

export const Route = createFileRoute("/sources/$id")({
  component: SourcePage,
});
