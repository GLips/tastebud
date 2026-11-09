import {
  Alert,
  Box,
  Button,
  Center,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import type { DerivationRow } from "@tastebud/core/record-browsing";
import {
  type DecisionOutcome,
  DERIVATION_STATUSES,
  type DerivationStatus,
  DerivationStatusSchema,
} from "@tastebud/core/taste-vocabulary";
import { Schema } from "effect";
import { MapPin, Search } from "lucide-react";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { capitalize, findKindView, KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { PlaceFormIcon } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import {
  DERIVATION_STATUS_MEANINGS,
  DERIVATION_STATUS_WORDS,
  DerivationStatusDot,
} from "#review/shared/ui/status-chips.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import { derivationListQuery } from "./derivation-list-queries.ts";
import { KindLibraryRow } from "./kind-library-row.tsx";
import { useKindLibraryFilters } from "./use-kind-library-filters.ts";
import { useLibraryDecision } from "./use-library-decision.ts";

const styles = stylex.create({
  numericNoWrap: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  groupRow: { backgroundColor: "var(--mantine-color-gray-0)" },
  // The decision notice and its Undo stay in view under the shell header while the list scrolls.
  stickyNotice: { position: "sticky", top: "calc(var(--review-shell-header-height) + 8px)", zIndex: 5 },
  columnHead: { whiteSpace: "nowrap" },
});

const STATUS_AFTER_OUTCOME: Record<DecisionOutcome, DerivationStatus> = {
  accept: "accepted",
  reject: "rejected",
  retract: "retracted",
  reopen: "pending",
};

const STATUS_CHOICES = ["all", ...DERIVATION_STATUSES] as const;

export const KindLibrarySearch = Schema.Struct({
  status: Schema.optionalKey(DerivationStatusSchema),
  place: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
});

/** Rows in status sections, in lifecycle order; a status with no rows has no section. */
const groupDerivationRowsByStatus = (rows: ReadonlyArray<DerivationRow>) =>
  DERIVATION_STATUSES.map((status) => ({ status, rows: rows.filter((row) => row.status === status) })).filter(
    (group) => group.rows.length > 0,
  );

/**
 * The accepted section's subtitle in the kind's own words: a one-word label is a verb ("Believe" reads "You
 * believe these"); a longer one is a judgement ("Worth doing" reads "You marked these worth doing").
 */
const acceptedMeaningOf = (acceptLabel: string) => {
  const words = acceptLabel.toLowerCase();
  return words.includes(" ") ? `You marked these ${words}` : `You ${words} these`;
};

/** A column's name over the library table. */
function LibraryColumnHead({ label, align = "left" }: { label: string; align?: "left" | "right" }) {
  return (
    <Table.Th ta={align} {...stylex.props(styles.columnHead)}>
      <Text size="xs" c="gray.7" fw={600}>
        {label}
      </Text>
    </Table.Th>
  );
}

/** A status section's header row: its mark, word, count and what the status means. */
function LibrarySectionHeader({
  status,
  count,
  acceptLabel,
}: {
  status: DerivationStatus;
  count: number;
  acceptLabel: string | undefined;
}) {
  return (
    <Table.Tr {...stylex.props(styles.groupRow)}>
      <Table.Td colSpan={5} py="xxs">
        <Group gap="xs" wrap="nowrap">
          <DerivationStatusDot status={status} />
          <Text size="sm" fw={600}>
            {DERIVATION_STATUS_WORDS[status]}
          </Text>
          <SupportingText tier="secondary" {...stylex.props(styles.numericNoWrap)}>
            {count}
          </SupportingText>
          <SupportingText tier="secondary">
            {status === "accepted" && acceptLabel !== undefined
              ? acceptedMeaningOf(acceptLabel)
              : DERIVATION_STATUS_MEANINGS[status]}
          </SupportingText>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

/**
 * What the last decision made from a row did, with Undo, under the filters: it stays when the row leaves the
 * filter or moves section. A refusal says why and links to the page, which can preview what accepting needs.
 */
function LibraryDecisionNotice({ decision }: { decision: ReturnType<typeof useLibraryDecision> }) {
  if (decision.failure !== undefined)
    return (
      <Alert color="red" variant="light" py="xs" role="alert">
        <Text size="sm">
          {decision.failure.sentence}{" "}
          <AnchorLink to="/derivations/$id" params={{ id: decision.failure.row.id }} size="sm">
            Decide on its page
          </AnchorLink>
        </Text>
      </Alert>
    );
  if (decision.undoable === undefined) return null;
  return (
    <Alert color="tastebud" variant="light" py="xs" aria-live="polite">
      <Group gap="sm" wrap="nowrap" justify="space-between">
        <Text size="sm" lineClamp={1}>
          “{decision.undoable.row.statement}” moved to{" "}
          {DERIVATION_STATUS_WORDS[STATUS_AFTER_OUTCOME[decision.undoable.outcome]]}.
        </Text>
        <Button variant="subtle" loading={decision.undoing} onClick={() => void decision.undo()}>
          Undo
        </Button>
      </Group>
    </Alert>
  );
}

export function KindLibraryPage() {
  const { kindKey, search, text, setFilter, typeText } = useKindLibraryFilters();
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const kind = findKindView(catalog, kindKey);
  const decision = useLibraryDecision();
  const list = useQuery(
    derivationListQuery({
      kind: kindKey,
      status: search.status,
      place: search.place,
      text: search.text,
    }),
  );

  const plural = kind?.plural ?? kindKey;
  const filtered = search.status !== undefined || search.place !== undefined || search.text !== undefined;

  return (
    <Stack gap="md">
      <ReviewPageHeader icon={<KindGlyph catalog={catalog} kind={kindKey} size={14} />} title={capitalize(plural)} />

      <Group gap="sm" wrap="wrap">
        <TextInput
          w={320}
          aria-label="Filter by words"
          placeholder="Search the statement or reasoning"
          leftSection={<Search size={14} />}
          value={text}
          onChange={(event) => typeText(event.currentTarget.value)}
        />
        <SegmentedControl
          value={search.status ?? "all"}
          data={STATUS_CHOICES.map((value) => ({ value, label: capitalize(value) }))}
          onChange={(value) => setFilter({ status: value === "all" ? undefined : value })}
        />
        <Select
          w={220}
          leftSection={<MapPin size={14} />}
          placeholder="Any place"
          aria-label="Only what applies at this place"
          clearable
          searchable
          value={search.place ?? null}
          data={known.places.map((place) => ({ value: place, label: known.labelOf(place) }))}
          renderOption={({ option }) => (
            <Group gap="xxs" wrap="nowrap">
              <PlaceFormIcon place={option.value} />
              <Text size="sm">{option.label}</Text>
            </Group>
          )}
          onChange={(value) => setFilter({ place: value ?? undefined })}
        />
      </Group>
      {search.place !== undefined && (
        <SupportingText tier="secondary">
          Showing what would apply at {known.labelOf(search.place)}: its own places, the places containing it, and
          everything global.
        </SupportingText>
      )}

      <Box {...stylex.props(styles.stickyNotice)}>
        <LibraryDecisionNotice decision={decision} />
      </Box>

      <LoadedQueryContent query={list}>
        {(rows) =>
          rows.length === 0 ? (
            <Center py="xxl">
              <Text c="dimmed">{filtered ? `No ${plural} match these filters.` : `No ${plural} yet.`}</Text>
            </Center>
          ) : (
            <Paper p={0}>
              <Table verticalSpacing="xs" horizontalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <LibraryColumnHead label={capitalize(kind?.singular ?? kindKey)} />
                    <LibraryColumnHead label="Notes" />
                    <LibraryColumnHead label="Applies in" />
                    <LibraryColumnHead label="Proposed" align="right" />
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {groupDerivationRowsByStatus(rows).flatMap(({ status, rows: group }) =>
                    [
                      <LibrarySectionHeader
                        key={`section-${status}`}
                        status={status}
                        count={group.length}
                        acceptLabel={kind?.acceptLabel}
                      />,
                    ].concat(
                      group.map((row) => (
                        <KindLibraryRow
                          key={row.id}
                          row={row}
                          labels={known.labels}
                          owner={catalog?.owner}
                          acceptLabel={kind?.acceptLabel}
                          decision={{
                            deciding: decision.decidingId === row.id,
                            overlapping: decision.overlappingId === row.id,
                            onActivate: () => decision.activate(row),
                            onDecide: (request) => decision.decide(row, request),
                            onCancelAccept: decision.cancelAccept,
                          }}
                        />
                      )),
                    ),
                  )}
                </Table.Tbody>
              </Table>
            </Paper>
          )
        }
      </LoadedQueryContent>
      {kind === undefined && catalog !== undefined && (
        <Alert color="gray" variant="light">
          Retired kinds can be listed and shown, but not proposed, accepted or recalled.
        </Alert>
      )}
    </Stack>
  );
}
