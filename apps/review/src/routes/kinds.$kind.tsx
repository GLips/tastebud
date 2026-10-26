import {
  Alert,
  Center,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DERIVATION_STATUSES, type DerivationStatus, DerivationStatusSchema } from "@taste/core/vocabulary";
import { Schema } from "effect";
import { CornerDownRight, MessageSquare, Search } from "lucide-react";
import { useState } from "react";

import { formatReviewDate } from "../ui/format.ts";
import { capitalize, describeKindDelivery, findKindView, KindGlyph } from "../ui/kind-identity.tsx";
import { PlaceFormIcon, ScopeChips } from "../ui/place-chips.tsx";
import { derivationListQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { AnchorLink } from "../ui/router-links.tsx";
import { DerivationStatusDot } from "../ui/status-chips.tsx";
import { useKnownPlaces, useReviewCatalog } from "../ui/use-review-context.ts";

const STATUS_CHOICES = ["all", ...DERIVATION_STATUSES] as const;

const KindLibrarySearch = Schema.Struct({
  status: Schema.optionalKey(DerivationStatusSchema),
  place: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
});

export const Route = createFileRoute("/kinds/$kind")({
  validateSearch: Schema.toStandardSchemaV1(KindLibrarySearch),
  component: KindLibraryScreen,
});

function KindLibraryScreen() {
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
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <Stack gap={2}>
          <Group gap={8}>
            <KindGlyph catalog={catalog} kind={kindKey} size={14} />
            <Title order={3}>{capitalize(plural)}</Title>
          </Group>
          <Text size="xs" c="dimmed">
            {kind === undefined
              ? "This kind is no longer in taste.config.ts; its records are read-only."
              : [kind.description, describeKindDelivery(kind)].filter(Boolean).join(" ")}
          </Text>
        </Stack>
      </Group>

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
            <Group gap={6} wrap="nowrap">
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

      {list.error ? (
        <QueryErrorAlert error={list.error} />
      ) : list.data === undefined ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : list.data.length === 0 ? (
        <Center py={60}>
          <Text c="dimmed">{filtered ? `No ${plural} match these filters.` : `No ${plural} yet.`}</Text>
        </Center>
      ) : (
        <Paper p={0}>
          <Table verticalSpacing={8} horizontalSpacing="md" highlightOnHover>
            <Table.Tbody>
              {list.data.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td w={28} pr={0}>
                    <DerivationStatusDot status={row.status} />
                  </Table.Td>
                  <Table.Td>
                    <AnchorLink
                      to="/derivations/$id"
                      params={{ id: row.id }}
                      c="inherit"
                      fw={500}
                      size="sm"
                      underline="hover"
                    >
                      {row.statement}
                    </AnchorLink>
                    {row.replacedBy !== undefined && (
                      <Group gap={4} wrap="nowrap">
                        <CornerDownRight size={12} color="var(--mantine-color-gray-5)" />
                        <AnchorLink
                          to="/derivations/$id"
                          params={{ id: row.replacedBy.id }}
                          size="xs"
                          c="dimmed"
                          lineClamp={1}
                        >
                          {row.replacedBy.statement}
                        </AnchorLink>
                      </Group>
                    )}
                    {row.status === "rejected" && row.reason !== undefined && (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        “{row.reason}”
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td w={48}>
                    {row.threadCount > 0 && (
                      <Tooltip
                        label={`${row.threadCount} ${row.threadCount === 1 ? "note" : "notes"} in the thread`}
                        withArrow
                      >
                        <Group gap={3} wrap="nowrap" c="dimmed">
                          <MessageSquare size={13} />
                          <Text size="xs">{row.threadCount}</Text>
                        </Group>
                      </Tooltip>
                    )}
                  </Table.Td>
                  <Table.Td style={{ width: "1%", whiteSpace: "nowrap" }}>
                    <ScopeChips scope={row.effectiveScope} labels={known.labels} />
                  </Table.Td>
                  <Table.Td w={96} ta="right">
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      {formatReviewDate(row.proposedAt)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
      {kind === undefined && catalog !== undefined && (
        <Alert color="gray" variant="light">
          Retired kinds can be listed and shown, but not proposed, accepted or recalled.
        </Alert>
      )}
    </Stack>
  );
}
