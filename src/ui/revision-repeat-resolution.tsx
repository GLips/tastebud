/**
 * A scope revision is a new proposal, so it meets the same near-repeat gate an agent's would. When
 * it is refused, the reviewer looks at each blocking match and says what is different now, the same
 * despite and why an agent must give; each match gets its own checkbox, never "acknowledge all".
 */
import { Button, Group, Paper, Stack, Text, Textarea } from "@mantine/core";
import { useState } from "react";

import type { RepeatMatch } from "../core/index.ts";
import type { DerivationScope } from "../shared/places.ts";
import { BlockingMatchRow } from "./acceptance-preview.tsx";
import { ScopeChips } from "./place-chips.tsx";

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
    <Paper p="md" withBorder style={{ borderColor: "var(--mantine-color-orange-3)" }}>
      <Stack gap="sm">
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            {matches.length === 1
              ? "The new scope overlaps something you've already decided"
              : `The new scope overlaps ${matches.length} things you've already decided`}
          </Text>
          <Text size="xs" c="dimmed">
            Look at each one. Agents that later propose this again are shown what you write here.
          </Text>
        </Stack>
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            Revision applies in
          </Text>
          <ScopeChips scope={scope} labels={labels} wrap="wrap" />
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
        <Textarea
          size="sm"
          label="What's different now?"
          placeholder="What changed since these were decided"
          autosize
          minRows={2}
          value={why}
          onChange={(event) => setWhy(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              propose();
            }
          }}
        />
        <Group justify="flex-end" gap={6}>
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
