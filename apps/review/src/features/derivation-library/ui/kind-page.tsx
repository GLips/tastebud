import { Alert, Center, Group, Paper, SegmentedControl, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import type { DerivationRow } from "@tastebud/core/record-browsing";
import { DERIVATION_STATUSES, type DerivationStatus, DerivationStatusSchema } from "@tastebud/core/taste-vocabulary";
import { Schema } from "effect";
import { Search } from "lucide-react";
import { useState } from "react";

import { useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { capitalize, findKindView, KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { PlaceFormIcon } from "#review/shared/ui/place-chips.tsx";
import {
  DERIVATION_STATUS_MEANINGS,
  DERIVATION_STATUS_WORDS,
  DerivationStatusDot,
} from "#review/shared/ui/status-chips.tsx";

import { derivationListQuery } from "./derivation-list-queries.ts";
import { KindLibraryRow } from "./kind-library-row.tsx";

const styles = stylex.create({
  numericNoWrap: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  groupRow: { backgroundColor: "var(--mantine-color-gray-0)" },
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

/** A status section's header row: its mark, word, count and what the status means. */
function LibrarySectionHeader({ status, count }: { status: DerivationStatus; count: number }) {
  return (
    <Table.Tr {...stylex.props(styles.groupRow)}>
      <Table.Td colSpan={5} py="xxs">
        <Group gap="xs" wrap="nowrap">
          <DerivationStatusDot status={status} />
          <Text size="sm" fw={600}>
            {DERIVATION_STATUS_WORDS[status]}
          </Text>
          <Text size="sm" c="gray.7" {...stylex.props(styles.numericNoWrap)}>
            {count}
          </Text>
          <Text size="sm" c="gray.7">
            {DERIVATION_STATUS_MEANINGS[status]}
          </Text>
        </Group>
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
        purpose={
          kind === undefined
            ? "This kind is no longer in tastebud.config.ts; its records can be read but not decided."
            : `Every ${kind.singular} your agents have proposed, grouped by where it stands. Open one to see why; change your mind from its ⋯ menu.`
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
        <Text size="sm" c="gray.7">
          Showing what would apply at {known.labelOf(search.place)}: its own places, the places containing it, and
          everything global.
        </Text>
      )}

      <LoadedQueryContent query={list}>
        {(rows) =>
          rows.length === 0 ? (
            <Center py="xxl">
              <Text c="dimmed">{filtered ? `No ${plural} match these filters.` : `No ${plural} yet.`}</Text>
            </Center>
          ) : (
            <Paper p={0}>
              <Table verticalSpacing="xs" horizontalSpacing="md">
                {/* One body with the section headers interleaved: a row keeps its key, and so its Undo, as a
                    decision moves it to another section. */}
                <Table.Tbody>
                  {groupDerivationRowsByStatus(rows).flatMap(({ status, rows: group }) =>
                    [<LibrarySectionHeader key={`section-${status}`} status={status} count={group.length} />].concat(
                      group.map((row) => (
                        <KindLibraryRow
                          key={row.id}
                          row={row}
                          labels={known.labels}
                          owner={catalog?.owner}
                          acceptLabel={kind?.acceptLabel}
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
