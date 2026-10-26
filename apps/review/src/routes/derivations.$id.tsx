import { createFileRoute } from "@tanstack/react-router";

import { DerivationPage } from "#review/features/derivation-decisions/index.ts";

export const Route = createFileRoute("/derivations/$id")({
  component: DerivationPage,
});
