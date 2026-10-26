import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "#review/features/settings/index.ts";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});
