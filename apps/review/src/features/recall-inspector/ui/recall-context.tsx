/** Where the recall inspector stood: the resolved context and its places, or why it couldn't resolve one. */
import { Box, Alert, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { TasteContext } from "@tastebud/core/places";
import { LocateFixed } from "lucide-react";

import { useKnownPlaces } from "#review/features/review-shell/index.ts";
import { ReviewQueryError } from "#review/shared/review-outcome.ts";
import { PlaceChip } from "#review/shared/ui/place-chips.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

const styles = stylex.create({
  preWrap: { whiteSpace: "pre-wrap" },
  contextBar: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minHeight: "24px" },
});

const ORIGIN_WORDING: Record<TasteContext["origin"], string> = {
  in: "That folder counts as",
  at: "Standing at",
  cwd: "The server's own folder counts as",
  "mcp-root": "The agent's project counts as",
  unknown: "That folder isn't any place, so only items that apply everywhere reach",
};

export function RecallContextSummary({ context }: { context: TasteContext }) {
  const known = useKnownPlaces(context.places);
  return (
    <Box {...stylex.props(styles.contextBar)}>
      <LocateFixed size={14} color="var(--mantine-color-gray-6)" />
      <SupportingText tier="secondary">{ORIGIN_WORDING[context.origin]}</SupportingText>
      {context.places.map((place) => (
        <PlaceChip key={place} place={place} label={known.labelOf(place)} />
      ))}
    </Box>
  );
}

export function RecallFailure({ error }: { error: Error }) {
  if (error instanceof ReviewQueryError && error.failure.tag === "PlaceResolutionFailed")
    return (
      <Alert color="red" variant="light" title="Couldn't work out where that is">
        <Text size="sm" {...stylex.props(styles.preWrap)}>
          {error.message}
        </Text>
        <SupportingText tier="secondary" mt="2xs">
          Nothing was recalled. Try another directory, or pick a place instead.
        </SupportingText>
      </Alert>
    );
  return <QueryErrorAlert error={error} />;
}
