/**
 * The acceptance preview: the statement, the scope it would settle on, and a line counting the close
 * records it overlaps over a linked row for each. One "anyway" records every acknowledgement: the rows
 * are the look, and a box per match only made the owner tick through it.
 */
import { Box, Alert, Button, Group, Loader, Paper, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { type DerivationScope, formatPlaceLabel } from "@tastebud/core/places";
import type { RepeatMatch } from "@tastebud/core/record-views";
import { TriangleAlert } from "lucide-react";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { CautionChip } from "#review/shared/ui/caution-chip.tsx";
import { DerivationRelationRow } from "#review/shared/ui/derivation-relation-row.tsx";
import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

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
  label: { display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", columnGap: "10px", alignItems: "baseline" },
});

/** What a close record is to the owner, counted in the overlap line: "1 waiting proposal". */
const MATCH_NOUNS: Record<RepeatMatch["status"], readonly [one: string, many: string]> = {
  rejected: ["rejection", "rejections"],
  pending: ["waiting proposal", "waiting proposals"],
  accepted: ["accepted item", "accepted items"],
  retracted: ["retracted item", "retracted items"],
  superseded: ["replaced item", "replaced items"],
};

const OVERLAP_ORDER = ["pending", "rejected", "accepted", "retracted", "superseded"] as const;

/** "Overlaps 1 waiting proposal and 2 rejections". */
const overlapLineOf = (matches: ReadonlyArray<RepeatMatch>): string => {
  const phrases = OVERLAP_ORDER.flatMap((status) => {
    const count = matches.filter((match) => match.status === status).length;
    const [one, many] = MATCH_NOUNS[status];
    return count === 0 ? [] : [`${count} ${count === 1 ? one : many}`];
  });
  const last = phrases.pop();
  return `Overlaps ${phrases.length === 0 ? last : `${phrases.join(", ")} and ${last}`}`;
};

/**
 * What else is close under this scope: one line, then each as a linked row, so "anyway" is pressed
 * knowing what it weighs. The ones the proposal already answered with `despite` need nothing.
 */
function OverlapSummary({
  error,
  loaded,
  matches,
  answered,
  labels,
}: {
  error: Error | null;
  loaded: boolean;
  matches: ReadonlyArray<RepeatMatch>;
  answered: ReadonlyArray<RepeatMatch>;
  labels: ReadonlyMap<string, string>;
}) {
  const catalog = useReviewCatalog();
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
        <SupportingText tier="secondary">Checking for anything close to it…</SupportingText>
      </Group>
    );
  if (matches.length === 0)
    return (
      <SupportingText tier="secondary">
        {answered.length > 0
          ? "Nothing close overlaps this scope beyond what the agent already answered."
          : "Nothing close to it overlaps this scope."}
      </SupportingText>
    );
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {overlapLineOf(matches)}
      </Text>
      <Paper>
        {matches.map((match) => (
          <DerivationRelationRow
            key={match.id}
            relation={match.status === "rejected" ? "Near a rejection" : "Near a repeat"}
            relationChip={<CautionChip caution={match.status === "rejected" ? "near-a-rejection" : "near-a-repeat"} />}
            summary={match}
            catalog={catalog}
            labels={labels}
          />
        ))}
      </Paper>
    </Stack>
  );
}

const NO_SCOPE_CHANGES: ReadonlyArray<string> = [];

export function AcceptancePreview({
  target,
  statement,
  override,
  proposedScope,
  changes = NO_SCOPE_CHANGES,
  verb,
  consequence,
  active = false,
  conflict = false,
  pending,
  labels,
  onConfirm,
  onBack,
}: {
  target: string;
  statement: string;
  /** The amended scope; left out to accept as proposed. */
  override?: DerivationScope | undefined;
  proposedScope: DerivationScope;
  /** How the scope differs from the proposed one, a sentence each; none when it doesn't. */
  changes?: ReadonlyArray<string>;
  /** The kind's accept label: it names the confirm button ("Believe anyway"). */
  verb: string;
  /** What changes once it lands, in a sentence, when that isn't plain from the verb. */
  consequence?: string | undefined;
  /** Whether it listens for ⌘↵ and Esc: only the one the owner is working in. Off by default. */
  active?: boolean;
  /** The server found a match this preview didn't show; the draft is kept and nothing retried. */
  conflict?: boolean;
  pending: boolean;
  labels: ReadonlyMap<string, string>;
  onConfirm: (acknowledges: ReadonlyArray<string>) => void;
  onBack: () => void;
}) {
  const preview = useQuery(acceptPreviewQuery(target, override));
  const matches = preview.data?.needsAcknowledgement ?? [];
  const ready = preview.data !== undefined && !preview.isFetching && !pending;
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
          <SupportingText tier="secondary">{verb}</SupportingText>
          <Text {...stylex.props(styles.statement)}>{statement}</Text>
        </Box>
        <Box {...stylex.props(styles.label)}>
          <SupportingText tier="secondary">Applies in</SupportingText>
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
            Something close to it overlaps this scope. Read it below, then {verb.toLowerCase()} anyway or go back.
          </Alert>
        )}

        <OverlapSummary
          error={preview.error}
          loaded={preview.data !== undefined}
          matches={matches}
          answered={preview.data?.answeredByDespite ?? []}
          labels={labels}
        />

        <Group justify="flex-end" gap="xs">
          <Tooltip label="Back · Esc" withArrow>
            <Button variant="default" onClick={back} disabled={pending}>
              Back
            </Button>
          </Tooltip>
          <Tooltip label={`${verb} · ⌘↵`} withArrow>
            <Button onClick={confirm} disabled={!ready} loading={pending}>
              {matches.length > 0
                ? `${verb} anyway`
                : `${verb} ${scopeButtonPhrase(finalScope, (place) => labels.get(place) ?? formatPlaceLabel(place))}`}
            </Button>
          </Tooltip>
        </Group>
      </Stack>
    </Box>
  );
}
