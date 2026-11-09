/**
 * The acceptance preview, inside the card: the statement, the scope it would settle on, and a sentence
 * naming each close record it overlaps. One "anyway" records every acknowledgement: the sentence is the
 * look, and a box per match only made the owner tick through it.
 */
import { Box, Alert, Button, Group, Kbd, Loader, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { type DerivationScope, formatPlaceLabel } from "@tastebud/core/places";
import type { RepeatMatch } from "@tastebud/core/record-views";
import { TriangleAlert } from "lucide-react";
import { Fragment } from "react";

import { ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

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

/** How a close record is named in the overlap sentence: what it is to the owner, then its words. */
const MATCH_ROLES: Record<RepeatMatch["status"], string> = {
  rejected: "your rejection of",
  pending: "the waiting proposal",
  accepted: "what you already hold,",
  retracted: "what you retracted,",
  superseded: "the replaced",
};

function MatchName({ match }: { match: RepeatMatch }) {
  return (
    <>
      {MATCH_ROLES[match.status]}{" "}
      <AnchorLink to="/derivations/$id" params={{ id: match.id }} c="inherit" target="_blank">
        “{match.statement}”
      </AnchorLink>
      {match.reason !== undefined && ` (you said “${match.reason}”)`}
    </>
  );
}

/** What goes before the name at `index` in "a, b and c". */
const listSeparatorBefore = (index: number, count: number): string => {
  if (index === 0) return "";
  return index === count - 1 ? " and " : ", ";
};

/** "a", "a and b", "a, b and c", as nodes. */
function NameList({ matches }: { matches: ReadonlyArray<RepeatMatch> }) {
  return matches.map((match, index) => (
    <Fragment key={match.id}>
      {listSeparatorBefore(index, matches.length)}
      <MatchName match={match} />
    </Fragment>
  ));
}

/**
 * What else is close under this scope, said in a sentence, each named. The ones the proposal already
 * answered with `despite` are named too but need nothing; the rest are what "anyway" records weighing.
 */
function OverlapSummary({
  error,
  loaded,
  matches,
  answered,
  verb,
}: {
  error: Error | null;
  loaded: boolean;
  matches: ReadonlyArray<RepeatMatch>;
  answered: ReadonlyArray<RepeatMatch>;
  verb: string;
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
          Checking for anything close to it…
        </Text>
      </Group>
    );
  return (
    <Stack gap="3xs">
      {answered.length > 0 && (
        <Text size="sm" c="gray.7">
          It comes after <NameList matches={answered} />; the agent said what changed, so that needs nothing more.
        </Text>
      )}
      {matches.length > 0 ? (
        <Text size="sm">
          Under this scope it overlaps <NameList matches={matches} />. “{verb} anyway” records that you weighed{" "}
          {matches.length === 1 ? "it" : "them"}.
        </Text>
      ) : (
        <Text size="xs" c="dimmed">
          {answered.length > 0
            ? "Nothing else close to it overlaps this scope."
            : "Nothing close to it overlaps this scope."}
        </Text>
      )}
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
            Something close to it overlaps this scope. Read it below, then {verb.toLowerCase()} anyway or go back.
          </Alert>
        )}

        <OverlapSummary
          error={preview.error}
          loaded={preview.data !== undefined}
          matches={matches}
          answered={preview.data?.answeredByDespite ?? []}
          verb={verb}
        />

        <Group justify="flex-end" gap="xxs">
          <Button size="xs" variant="default" onClick={back} disabled={pending}>
            Back
            <Kbd size="xs" ml="xxs">
              Esc
            </Kbd>
          </Button>
          <Button size="xs" onClick={confirm} disabled={!ready} loading={pending}>
            {matches.length > 0
              ? `${verb} anyway`
              : `${verb} ${scopeButtonPhrase(finalScope, (place) => labels.get(place) ?? formatPlaceLabel(place))}`}
            <Kbd size="xs" ml="xxs">
              ⌘↵
            </Kbd>
          </Button>
        </Group>
      </Stack>
    </Box>
  );
}
