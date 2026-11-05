/** "Find a specific item": explains any item by id or words, even one this prompt never brought up. */
import { Button, Group, Paper, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import type { HookPayload } from "@tastebud/core/recall";
import type { RecallResult } from "@tastebud/core/record-views";
import { useState } from "react";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DerivationStatusDot } from "#review/shared/ui/status-chips.tsx";

import { recallExplanationQuery, type RecallExplanationRequest } from "./recall-queries.ts";
import { recallExplanationLines } from "./recall-reasons.ts";

const styles = stylex.create({
  grow: { flex: 1 },
});

const ID_LIKE = /^[0-9a-f-]{6,36}$/i;

export function RecallFindItemPanel({
  request,
  recall,
  hook,
}: {
  request: Omit<RecallExplanationRequest, "lookup">;
  recall: RecallResult;
  hook: HookPayload;
}) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const [needle, setNeedle] = useState("");
  const [submitted, setSubmitted] = useState("");
  const explanation = useQuery({
    ...recallExplanationQuery({
      ...request,
      lookup: ID_LIKE.test(submitted) ? { ref: submitted } : { text: submitted },
    }),
    enabled: submitted !== "",
  });
  const items = explanation.data?.items ?? [];
  const forThisPrompt = {
    injected: new Set(hook.items.map((item) => item.id)),
    recalled: new Set([...recall.accepted, ...recall.rejected, ...recall.history].map((hit) => hit.id)),
  };
  return (
    <Paper p="sm">
      <Stack gap="xs">
        <Tooltip label="Explains any item, even one these words never brought up" withArrow position="top-start">
          <Text size="sm" fw={600} w="fit-content">
            Find a specific item
          </Text>
        </Tooltip>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(needle.trim());
          }}
        >
          <Group gap="xxs" wrap="nowrap">
            <TextInput
              size="xs"
              aria-label="An id or words from the statement"
              autoComplete="off"
              data-1p-ignore
              placeholder="An id, or words from its statement"
              value={needle}
              onChange={(event) => setNeedle(event.currentTarget.value)}
              {...stylex.props(styles.grow)}
            />
            <Button size="xs" variant="default" type="submit" loading={explanation.isFetching}>
              Explain
            </Button>
          </Group>
        </form>
        {explanation.error && (
          <Text size="xs" c="red.7">
            {explanation.error.message}
          </Text>
        )}
        {submitted !== "" && explanation.isSuccess && items.length === 0 && (
          <Text size="xs" c="dimmed">
            Nothing matches “{submitted}”.
          </Text>
        )}
        {items.map((item) => (
          <Stack key={item.id} gap="3xs">
            <Group gap="xs" wrap="nowrap" align="baseline">
              <DerivationStatusDot status={item.status} />
              <AnchorLink to="/derivations/$id" params={{ id: item.id }} size="sm" fw={500} c="inherit">
                {item.statement}
              </AnchorLink>
            </Group>
            {recallExplanationLines(
              item,
              catalog,
              explanation.data?.context ?? recall.context,
              known,
              forThisPrompt,
            ).map((line) => (
              <Text key={line} size="xs" c="dimmed" pl="md">
                {line}
              </Text>
            ))}
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}
