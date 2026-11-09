/** One item looked up by its id in the query bar: whether it reaches agents where Recall stands, and why. */
import { Group, Paper, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DerivationStatusDot } from "#review/shared/ui/status-chips.tsx";

import { RecallFailure } from "./recall-context.tsx";
import { recallExplanationQuery, type RecallExplanationRequest } from "./recall-queries.ts";
import { recallExplanationLines } from "./recall-reasons.ts";

export function RecallItemExplanation({ request }: { request: RecallExplanationRequest }) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const explanation = useQuery(recallExplanationQuery(request));
  return (
    <LoadedQueryContent query={explanation} failurePanel={RecallFailure}>
      {(explained) =>
        explained.items.length === 0 ? (
          <Text size="sm">No item has that id.</Text>
        ) : (
          <Stack gap="sm">
            {explained.items.map((item) => (
              <Paper key={item.id} p="sm">
                <Stack gap="3xs">
                  <Group gap="xs" wrap="nowrap" align="baseline">
                    <DerivationStatusDot status={item.status} />
                    <AnchorLink to="/derivations/$id" params={{ id: item.id }} size="sm" fw={500} c="inherit">
                      {item.statement}
                    </AnchorLink>
                  </Group>
                  {recallExplanationLines(item, catalog, known).map((line) => (
                    <Text key={line} size="sm" c="dimmed" pl="md">
                      {line}
                    </Text>
                  ))}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )
      }
    </LoadedQueryContent>
  );
}
