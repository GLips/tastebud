import {
  Alert,
  Center,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import type { DerivationRow } from "@tastebud/core/record-browsing";
import { DERIVATION_STATUSES, type DerivationStatus, DerivationStatusSchema } from "@tastebud/core/taste-vocabulary";
import { Schema } from "effect";
import { CornerDownRight, MessageSquare, Search } from "lucide-react";
import { useState } from "react";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatReviewDate } from "#review/shared/format.ts";
import { capitalize, describeKindDelivery, findKindView, KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { PlaceFormIcon, ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import {
  DERIVATION_STATUS_MEANINGS,
  DERIVATION_STATUS_WORDS,
  DerivationStatusDot,
} from "#review/shared/ui/status-chips.tsx";
import { SubjectLabel } from "#review/shared/ui/subject-label.tsx";

import { derivationListQuery } from "./derivation-list-queries.ts";

const styles = stylex.create({
  fitCell: { width: "1%", whiteSpace: "nowrap" },
  numericNoWrap: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  groupRow: { backgroundColor: "var(--mantine-color-gray-0)" },
  row: { backgroundColor: { default: null, ":hover": "var(--mantine-color-gray-0)" } },
});

const STATUS_CHOICES = ["all", ...DERIVATION_STATUSES] as const;

export const KindLibrarySearch = Schema.Struct({
  status: Schema.optionalKey(DerivationStatusSchema),
  place: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
});

const Route = getRouteApi("/kinds/$kind");

/** Rows in status sections, in lifecycle order; a status with no rows has no section. */
const groupDerivationRowsByStatus = (rows: ReadonlyArray<DerivationRow>) =>
  DERIVATION_STATUSES.map((status) => ({ status, rows: rows.filter((row) => row.status === status) })).filter(
    (group) => group.rows.length > 0,
  );

/** Why a row is in its section, in one line; pending and accepted need none. */
function DerivationRowWhy({ row }: { row: DerivationRow }) {
  if (row.status === "superseded" && row.replacedBy !== undefined)
    return (
      <Group gap="2xs" wrap="nowrap">
        <CornerDownRight size={12} color="var(--mantine-color-gray-5)" />
        <Text size="xs" c="dimmed" span>
          Replaced by
        </Text>
        <AnchorLink to="/derivations/$id" params={{ id: row.replacedBy.id }} size="xs" c="dimmed" lineClamp={1}>
          “{row.replacedBy.statement}”
        </AnchorLink>
      </Group>
    );
  if (row.status === "rejected" || row.status === "retracted")
    return (
      <Text size="xs" c="dimmed" lineClamp={1}>
        {DERIVATION_STATUS_WORDS[row.status]} {formatReviewDate(row.decidedAt)}
        {row.reason !== undefined && `: “${row.reason}”`}
      </Text>
    );
  return null;
}

function KindLibraryRow({
  row,
  labels,
  owner,
}: {
  row: DerivationRow;
  labels: ReadonlyMap<string, string>;
  owner: string | undefined;
}) {
  return (
    <Table.Tr {...stylex.props(styles.row)}>
      <Table.Td pl="xl">
        <AnchorLink to="/derivations/$id" params={{ id: row.id }} c="inherit" fw={500} size="sm" underline="hover">
          {row.statement}
        </AnchorLink>{" "}
        <Text span size="xs" c="dimmed">
          <SubjectLabel summary={row} owner={owner} />
        </Text>
        <DerivationRowWhy row={row} />
      </Table.Td>
      <Table.Td w={48}>
        {row.threadCount > 0 && (
          <Tooltip label={`${row.threadCount} ${row.threadCount === 1 ? "note" : "notes"} in the thread`} withArrow>
            <Group gap="3xs" wrap="nowrap" c="dimmed">
              <MessageSquare size={13} />
              <Text size="xs">{row.threadCount}</Text>
            </Group>
          </Tooltip>
        )}
      </Table.Td>
      <Table.Td {...stylex.props(styles.fitCell)}>
        <ScopeChips scope={row.effectiveScope} labels={labels} />
      </Table.Td>
      <Table.Td w={96} ta="right">
        <Tooltip label="Proposed" withArrow>
          <Text size="xs" c="dimmed" {...stylex.props(styles.numericNoWrap)}>
            {formatReviewDate(row.proposedAt)}
          </Text>
        </Tooltip>
      </Table.Td>
    </Table.Tr>
  );
}

export function KindLibraryPage() {
  const { kind: kindKey } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  const kind = findKindView(catalog, kindKey);
  const [text, setText] = useState(search.text ?? "");
  const list = useQuery(
    derivationListQuery({
      kind: kindKey,
      status: search.status,
      place: search.place,
      text: search.text,
    }),
  );
  const setFilter = (next: {
    status?: DerivationStatus | undefined;
    place?: string | undefined;
    text?: string | undefined;
  }) =>
    void navigate({
      search: (previous) => {
        const merged = { ...previous, ...next };
        return {
          ...(merged.status !== undefined && { status: merged.status }),
          ...(merged.place !== undefined && { place: merged.place }),
          ...(merged.text !== undefined && merged.text !== "" && { text: merged.text }),
        };
      },
      replace: true,
    });
  const setTextFilter = useDebouncedCallback((value: string) => {
    const trimmed = value.trim();
    setFilter({ text: trimmed === "" ? undefined : trimmed });
  }, 250);

  const plural = kind?.plural ?? kindKey;
  const filtered = search.status !== undefined || search.place !== undefined || search.text !== undefined;

  return (
    <Stack gap="md">
      <ReviewPageHeader
        icon={<KindGlyph catalog={catalog} kind={kindKey} size={14} />}
        title={capitalize(plural)}
        purpose={`Every ${kind?.singular ?? kindKey} your agents have proposed, grouped by where it stands. Open one to see why, or to change your mind.`}
        details={
          kind === undefined
            ? "This kind is no longer in tastebud.config.ts; its records are read-only."
            : [kind.description, describeKindDelivery(kind)].filter(Boolean).join(" ")
        }
      />

      <Group gap="sm" wrap="wrap">
        <SegmentedControl
          size="xs"
          value={search.status ?? "all"}
          data={STATUS_CHOICES.map((value) => ({ value, label: capitalize(value) }))}
          onChange={(value) => setFilter({ status: value === "all" ? undefined : value })}
        />
        <Select
          size="xs"
          w={240}
          placeholder="Any place"
          aria-label="Only what applies at this place"
          clearable
          searchable
          value={search.place ?? null}
          data={known.places.map((place) => ({ value: place, label: known.labelOf(place) }))}
          renderOption={({ option }) => (
            <Group gap="xxs" wrap="nowrap">
              <PlaceFormIcon place={option.value} />
              <Text size="xs">{option.label}</Text>
            </Group>
          )}
          onChange={(value) => setFilter({ place: value ?? undefined })}
        />
        <TextInput
          size="xs"
          w={280}
          aria-label="Filter by words"
          placeholder="Words in the statement or reasoning"
          leftSection={<Search size={13} />}
          value={text}
          onChange={(event) => {
            setText(event.currentTarget.value);
            setTextFilter(event.currentTarget.value);
          }}
        />
      </Group>
      {search.place !== undefined && (
        <Text size="xs" c="dimmed" mt={-8}>
          Showing what would apply at {known.labelOf(search.place)}: its own places, the places containing it, and
          everything global.
        </Text>
      )}

      <LoadedQueryContent query={list}>
        {(rows) =>
          rows.length === 0 ? (
            <Center py={60}>
              <Text c="dimmed">{filtered ? `No ${plural} match these filters.` : `No ${plural} yet.`}</Text>
            </Center>
          ) : (
            <Paper p={0}>
              <Table verticalSpacing="xs" horizontalSpacing="md">
                {groupDerivationRowsByStatus(rows).map(({ status, rows: group }) => (
                  <Table.Tbody key={status}>
                    <Table.Tr {...stylex.props(styles.groupRow)}>
                      <Table.Td colSpan={4} py="xxs">
                        <Group gap="xs" wrap="nowrap">
                          <DerivationStatusDot status={status} />
                          <Text size="sm" fw={600}>
                            {DERIVATION_STATUS_WORDS[status]}
                          </Text>
                          <Text size="sm" c="dimmed" {...stylex.props(styles.numericNoWrap)}>
                            {group.length}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {DERIVATION_STATUS_MEANINGS[status]}
                          </Text>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                    {group.map((row) => (
                      <KindLibraryRow key={row.id} row={row} labels={known.labels} owner={catalog?.owner} />
                    ))}
                  </Table.Tbody>
                ))}
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
