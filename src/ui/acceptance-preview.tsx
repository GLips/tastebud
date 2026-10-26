/**
 * The acceptance preview, inside the card: the statement, the scope it would settle on, and each
 * blocking near repeat as its own row to acknowledge. There is no "acknowledge all" on purpose:
 * each earlier no deserves its own look.
 */
import { Alert, Button, Checkbox, Group, Kbd, Loader, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";

import type { RepeatMatch } from "../core/index.ts";
import type { DerivationScope } from "../shared/places.ts";
import { formatReviewDate } from "./format.ts";
import { ScopeChips } from "./place-chips.tsx";
import { acceptPreviewQuery } from "./review-queries.ts";
import { AnchorLink } from "./router-links.tsx";
import { DerivationStatusDot } from "./status-chips.tsx";

const styles = stylex.create({
  panel: {
    borderRadius: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--mantine-color-taste-2)",
    backgroundColor: "var(--mantine-color-taste-0)",
    padding: "12px",
  },
  statement: { fontSize: "14px", fontWeight: 600, lineHeight: 1.4 },
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

export function BlockingMatchRow({
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
    <div {...stylex.props(styles.match)}>
      <Stack gap={6}>
        <Group gap={8} wrap="nowrap" align="baseline">
          <DerivationStatusDot status={match.status} />
          <Text size="sm">
            <AnchorLink to="/derivations/$id" params={{ id: match.id }} c="inherit" target="_blank">
              “{match.statement}”
            </AnchorLink>
          </Text>
        </Group>
        <Group gap={8}>
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
    </div>
  );
}

export function AcceptancePreview({
  target,
  statement,
  override,
  proposedScope,
  changes,
  acceptLabel,
  confirmLabel = acceptLabel,
  backLabel = "Back",
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
  acceptLabel: string;
  /** The confirm button's words; the kind's accept label unless the flow names its own. */
  confirmLabel?: string;
  backLabel?: string;
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
    <div {...stylex.props(styles.panel)}>
      <Stack gap={10}>
        <div {...stylex.props(styles.label)}>
          <Text size="xs" c="dimmed">
            {acceptLabel}
          </Text>
          <Text {...stylex.props(styles.statement)}>{statement}</Text>
        </div>
        <div {...stylex.props(styles.label)}>
          <Text size="xs" c="dimmed">
            Applies in
          </Text>
          <Stack gap={4}>
            <ScopeChips scope={finalScope} labels={labels} wrap="wrap" linked={false} />
            {changes.map((change) => (
              <Text key={change} size="xs" c={change.startsWith("Applies everywhere") ? "orange.8" : "dimmed"}>
                {change}
              </Text>
            ))}
          </Stack>
        </div>

        {conflict && (
          <Alert color="yellow" variant="light" py={6} icon={<TriangleAlert size={14} />}>
            Another overlapping proposal needs review. Your scope is kept; look it over below.
          </Alert>
        )}

        {preview.error ? (
          <Alert color="red" variant="light" py={6}>
            {preview.error.message}
          </Alert>
        ) : preview.data === undefined ? (
          <Group gap={8}>
            <Loader size="xs" />
            <Text size="xs" c="dimmed">
              Checking for overlapping near repeats…
            </Text>
          </Group>
        ) : matches.length > 0 ? (
          <Stack gap={6}>
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
        ) : (
          <Text size="xs" c="dimmed">
            Nothing close to it overlaps this scope.
          </Text>
        )}

        <Group justify="flex-end" gap={6}>
          <Button size="xs" variant="default" onClick={back} disabled={pending}>
            {backLabel}
            <Kbd size="xs" ml={6}>
              Esc
            </Kbd>
          </Button>
          <Button size="xs" onClick={confirm} disabled={!ready} loading={pending}>
            {confirmLabel}
            <Kbd size="xs" ml={6}>
              ⌘↵
            </Kbd>
          </Button>
        </Group>
      </Stack>
    </div>
  );
}
