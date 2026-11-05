/**
 * A scope revision is a new proposal, so it meets the same near-repeat gate an agent's would. When
 * it is refused, the reviewer looks at each blocking match and says what is different now, the same
 * despite and why an agent must give; each match gets its own checkbox, never "acknowledge all".
 */
import { Button, Group, Paper, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { DerivationScope } from "@tastebud/core/places";
import type { RepeatMatch } from "@tastebud/core/record-views";
import { useState } from "react";

import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { ReviewTextarea } from "#review/shared/ui/textarea.tsx";

import { BlockingMatchRow } from "./acceptance-preview.tsx";

const styles = stylex.create({
  warningBorder: { borderColor: "var(--mantine-color-orange-3)" },
});

export function RevisionRepeatResolution({
  scope,
  matches,
  labels,
  pending,
  onPropose,
  onCancel,
}: {
  /** The scope the revision would propose. */
  scope: DerivationScope;
  matches: ReadonlyArray<RepeatMatch>;
  labels: ReadonlyMap<string, string>;
  pending: boolean;
  onPropose: (despite: ReadonlyArray<string>, despiteCase: string) => void;
  onCancel: () => void;
}) {
  const [considered, setConsidered] = useState<ReadonlySet<string>>(() => new Set());
  const [why, setWhy] = useState("");
  const trimmed = why.trim();
  const ready = trimmed !== "" && matches.every((match) => considered.has(match.id)) && !pending;
  const propose = () => {
    if (ready)
      onPropose(
        matches.map((match) => match.id),
        trimmed,
      );
  };
  return (
    <Paper p="md" withBorder {...stylex.props(styles.warningBorder)}>
      <Stack gap="sm">
        <Stack gap="3xs">
          <Text size="sm" fw={600}>
            {matches.length === 1
              ? "The new scope overlaps something you've already decided"
              : `The new scope overlaps ${matches.length} things you've already decided`}
          </Text>
          <Text size="xs" c="dimmed">
            Look at each one. Agents that later propose this again are shown what you write here.
          </Text>
        </Stack>
        <Group gap="xxs">
          <Text size="xs" c="dimmed">
            Revision applies in
          </Text>
          <ScopeChips scope={scope} labels={labels} wrap="wrap" linked={false} />
        </Group>
        {matches.map((match) => (
          <BlockingMatchRow
            key={match.id}
            match={match}
            checked={considered.has(match.id)}
            onChange={(checked) =>
              setConsidered((previous) => {
                const next = new Set(previous);
                if (checked) next.add(match.id);
                else next.delete(match.id);
                return next;
              })
            }
            labels={labels}
          />
        ))}
        <ReviewTextarea
          size="sm"
          label="What's different now?"
          placeholder="What changed since these were decided"
          minRows={2}
          value={why}
          onChange={(event) => setWhy(event.currentTarget.value)}
          onSubmitShortcut={propose}
        />
        <Group justify="flex-end" gap="xxs">
          <Button size="xs" variant="default" onClick={onCancel} disabled={pending}>
            Back to the scope
          </Button>
          <Button size="xs" onClick={propose} disabled={!ready} loading={pending}>
            Propose revision anyway
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
