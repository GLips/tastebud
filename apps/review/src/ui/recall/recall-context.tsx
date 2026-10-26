/** Where the recall inspector stood: the resolved context and its places, or why it couldn't resolve one. */
import { Alert, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { TasteContext } from "@taste/core/places";
import { LocateFixed } from "lucide-react";

import { ReviewQueryError } from "../../server/review-outcome.ts";
import { PlaceChip } from "../place-chips.tsx";
import { QueryErrorAlert } from "../route-panels.tsx";
import { useKnownPlaces } from "../use-review-context.ts";

const styles = stylex.create({
  contextBar: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minHeight: "24px" },
});

const ORIGIN_WORDING: Record<TasteContext["origin"], string> = {
  in: "Resolved from the directory",
  at: "Places taken as given",
  cwd: "Resolved from the working directory",
  "mcp-root": "Resolved from the MCP root",
  unknown: "Unknown context: only global items apply",
};

export function RecallContextSummary({ context }: { context: TasteContext }) {
  const known = useKnownPlaces(context.places);
  return (
    <div {...stylex.props(styles.contextBar)}>
      <LocateFixed size={14} color="var(--mantine-color-gray-6)" />
      <Text size="xs" c={context.origin === "unknown" ? "orange.8" : "dimmed"}>
        {ORIGIN_WORDING[context.origin]}
        {context.cwd !== undefined && context.origin !== "at" && ` (${context.cwd})`}
      </Text>
      {context.places.map((place) => (
        <PlaceChip key={place} place={place} label={known.labelOf(place)} />
      ))}
    </div>
  );
}

export function RecallFailure({ error }: { error: Error }) {
  if (error instanceof ReviewQueryError && error.failure.tag === "PlaceResolutionFailed")
    return (
      <Alert color="red" variant="light" title="Couldn't work out where that is">
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
          {error.message}
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          Nothing was recalled. Try another directory, or pick a place instead.
        </Text>
      </Alert>
    );
  return <QueryErrorAlert error={error} />;
}
