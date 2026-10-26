/** The recall inspector's right column: the exact payload the prompt hook would print, or why it stays silent. */
import { Alert, Badge, Code, Group, Paper, SegmentedControl, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { HookPayload } from "@taste/core";
import { useState } from "react";

import { useReviewCatalog } from "../use-review-context.ts";
import { hookSilenceWording } from "./recall-reasons.ts";

const styles = stylex.create({
  sticky: { position: { default: "sticky", "@media (max-width: 960px)": "static" }, top: "68px" },
  payload: { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "12px", lineHeight: 1.55 },
  stale: { opacity: 0.55 },
});

export function RecallInjectedPanel({ hook, stale }: { hook: HookPayload; stale: boolean }) {
  const catalog = useReviewCatalog();
  const [view, setView] = useState<"context" | "stdout">("context");
  return (
    <Paper p="sm" {...stylex.props(styles.sticky)}>
      <Group justify="space-between" mb="xs">
        <Group gap={8}>
          <Tooltip
            label="The exact bytes the prompt hook would print for this prompt, here"
            withArrow
            multiline
            w={260}
          >
            <Text size="sm" fw={600}>
              Would inject
            </Text>
          </Tooltip>
          {stale && (
            <Tooltip label="The inputs changed; run again to refresh" withArrow>
              <Badge color="yellow" variant="light" size="xs">
                Stale
              </Badge>
            </Tooltip>
          )}
        </Group>
        {hook.additionalContext !== undefined && (
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(value) => setView(value === "stdout" ? "stdout" : "context")}
            data={[
              { value: "context", label: "Context" },
              { value: "stdout", label: "Hook stdout" },
            ]}
          />
        )}
      </Group>
      {hook.additionalContext === undefined ? (
        <Alert
          color={hook.silence === "over-budget" ? "yellow" : "gray"}
          variant="light"
          {...stylex.props(stale && styles.stale)}
        >
          Silent. {hookSilenceWording(hook, catalog)} The prompt goes through untouched.
        </Alert>
      ) : (
        <Code block {...stylex.props(styles.payload, stale && styles.stale)}>
          {view === "context" ? hook.additionalContext : hook.hookOutput}
        </Code>
      )}
    </Paper>
  );
}
