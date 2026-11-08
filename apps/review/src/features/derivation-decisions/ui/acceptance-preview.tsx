/**
 * The acceptance preview, inside the card: the statement, the scope it would settle on, and each
 * blocking near repeat as its own row to acknowledge. The confirm button names that scope. There is no "acknowledge all" on purpose:
 * each earlier no deserves its own look.
 */
import { Box, Alert, Button, Checkbox, Group, Kbd, Loader, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { type DerivationScope, formatPlaceLabel } from "@tastebud/core/places";
import type { RepeatMatch } from "@tastebud/core/record-views";
import { TriangleAlert } from "lucide-react";

import { formatReviewDate } from "#review/shared/format.ts";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DerivationStatusDot } from "#review/shared/ui/status-chips.tsx";

import { acceptPreviewQuery } from "./decision-queries.ts";
import { scopeButtonPhrase } from "./scope-draft.ts";

const styles = stylex.create({
  panel: {
    borderRadius: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--mantine-color-tastebud-2)",
    backgroundColor: "var(--mantine-color-tastebud-0)",
    padding: "12px",
  },
  statement: { fontWeight: 600, lineHeight: 1.4 },
  match: {
    borderRadius: "6px",
    backgroundColor: "white",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--mantine-color-orange-2)",
    padding: "8px 10px",
  },
  label: { display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", columnGap: "10px", alignItems: "baseline" },
});

const acknowledgementWording = (match: RepeatMatch): string => {
  switch (match.status) {
    case "rejected":
      return "I've considered this earlier rejection.";
    case "pending":
      return `I've considered this overlapping proposal.`;
    default:
      return `I've considered this ${match.status} ${match.kindLabel}.`;
  }
};

function BlockingMatchRow({
  match,
  checked,
  onChange,
  labels,
}: {
  match: RepeatMatch;
  checked: boolean;
  onChange: (checked: boolean) => void;
  labels: ReadonlyMap<string, string>;
}) {
  return (
    <Box {...stylex.props(styles.match)}>
      <Stack gap="xxs">
        <Group gap="xs" wrap="nowrap" align="baseline">
          <DerivationStatusDot status={match.status} />
          <Text size="sm">
            <AnchorLink to="/derivations/$id" params={{ id: match.id }} c="inherit" target="_blank">
              “{match.statement}”
            </AnchorLink>
          </Text>
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed" tt="capitalize">
            {match.status}
            {match.decidedAt !== undefined && ` ${formatReviewDate(match.decidedAt)}`}
          </Text>
          <ScopeChips scope={match.effectiveScope} labels={labels} linked={false} />
        </Group>
        {match.reason !== undefined && (
          <Text size="sm" c="dark.4">
            Your reason: “{match.reason}”
          </Text>
        )}
        <Checkbox
          size="xs"
          checked={checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
          label={acknowledgementWording(match)}
        />
      </Stack>
    </Box>
  );
}

/** The near repeats an accept must acknowledge one by one, once the preview has found them. */
function NearRepeatAcknowledgements({
  error,
  loaded,
  matches,
  acknowledged,
  onAcknowledge,
  labels,
}: {
  error: Error | null;
  loaded: boolean;
  matches: ReadonlyArray<RepeatMatch>;
  acknowledged: ReadonlySet<string>;
  onAcknowledge: (id: string, checked: boolean) => void;
  labels: ReadonlyMap<string, string>;
}) {
  if (error)
    return (
      <Alert color="red" variant="light" py="xxs">
        {error.message}
      </Alert>
    );
  if (!loaded)
    return (
      <Group gap="xs">
        <Loader size="xs" />
        <Text size="xs" c="dimmed">
          Checking for overlapping near repeats…
        </Text>
      </Group>
    );
  if (matches.length === 0)
    return (
      <Text size="xs" c="dimmed">
        Nothing close to it overlaps this scope.
      </Text>
    );
  return (
    <Stack gap="xxs">
      <Text size="sm" fw={500}>
        {matches.length === 1
          ? "This scope overlaps something close to it"
          : `This scope overlaps ${matches.length} things close to it`}
      </Text>
      {matches.map((match) => (
        <BlockingMatchRow
          key={match.id}
          match={match}
          checked={acknowledged.has(match.id)}
          onChange={(checked) => onAcknowledge(match.id, checked)}
          labels={labels}
        />
      ))}
    </Stack>
  );
}

export function AcceptancePreview({
  target,
  statement,
  override,
  proposedScope,
  changes,
  verb,
  consequence,
  active,
  acknowledged,
  onAcknowledge,
  conflict,
  pending,
  labels,
  onConfirm,
  onBack,
}: {
  target: string;
  statement: string;
  /** The amended scope, or undefined to accept as proposed. */
  override: DerivationScope | undefined;
  proposedScope: DerivationScope;
  changes: ReadonlyArray<string>;
  /** What confirming does, before the scope: the kind's accept label, or "Apply" when moving an accepted one. */
  verb: string;
  /** What changes once it lands, in a sentence, when that isn't plain from the verb. */
  consequence?: string | undefined;
  /** Only the preview on the selected card listens for ⌘↵ and Esc; other cards' previews stay put. */
  active: boolean;
  acknowledged: ReadonlySet<string>;
  onAcknowledge: (id: string, checked: boolean) => void;
  /** The server found a match this preview didn't show; the draft is kept and nothing retried. */
  conflict: boolean;
  pending: boolean;
  labels: ReadonlyMap<string, string>;
  onConfirm: (acknowledges: ReadonlyArray<string>) => void;
  onBack: () => void;
}) {
  const preview = useQuery(acceptPreviewQuery(target, override));
  const matches = preview.data?.needsAcknowledgement ?? [];
  const missing = matches.filter((match) => !acknowledged.has(match.id));
  const ready = preview.data !== undefined && !preview.isFetching && missing.length === 0 && !pending;
  const confirm = () => {
    if (ready) onConfirm(matches.map((match) => match.id));
  };
  const back = () => {
    if (!pending) onBack();
  };
  useHotkeys([
    { hotkey: "Mod+Enter", callback: confirm, options: { ignoreInputs: false, enabled: active } },
    { hotkey: "Escape", callback: back, options: { ignoreInputs: false, enabled: active } },
  ]);
  const finalScope = preview.data?.effectiveScope ?? override ?? proposedScope;

  return (
    <Box {...stylex.props(styles.panel)}>
      <Stack gap={10}>
        <Box {...stylex.props(styles.label)}>
          <Text size="xs" c="dimmed">
            {verb}
          </Text>
          <Text {...stylex.props(styles.statement)}>{statement}</Text>
        </Box>
        <Box {...stylex.props(styles.label)}>
          <Text size="xs" c="dimmed">
            Applies in
          </Text>
          <Stack gap="2xs">
            <ScopeChips scope={finalScope} labels={labels} wrap="wrap" linked={false} />
            {changes.map((change) => (
              <Text key={change} size="xs" c={change.startsWith("Applies everywhere") ? "orange.8" : "dimmed"}>
                {change}
              </Text>
            ))}
          </Stack>
        </Box>
        {consequence !== undefined && <Text size="sm">{consequence}</Text>}

        {conflict && (
          <Alert color="yellow" variant="light" py="xxs" icon={<TriangleAlert size={14} />}>
            Something close to it overlaps this scope. Look it over below, then accept anyway or go back.
          </Alert>
        )}

        <NearRepeatAcknowledgements
          error={preview.error}
          loaded={preview.data !== undefined}
          matches={matches}
          acknowledged={acknowledged}
          onAcknowledge={onAcknowledge}
          labels={labels}
        />

        <Group justify="flex-end" gap="xxs">
          <Button size="xs" variant="default" onClick={back} disabled={pending}>
            Back
            <Kbd size="xs" ml="xxs">
              Esc
            </Kbd>
          </Button>
          <Button size="xs" onClick={confirm} disabled={!ready} loading={pending}>
            {verb} {scopeButtonPhrase(finalScope, (place) => labels.get(place) ?? formatPlaceLabel(place))}
            <Kbd size="xs" ml="xxs">
              ⌘↵
            </Kbd>
          </Button>
        </Group>
      </Stack>
    </Box>
  );
}
