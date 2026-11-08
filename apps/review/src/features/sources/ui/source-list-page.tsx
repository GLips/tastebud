import { Center, Group, Paper, SegmentedControl, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Schema } from "effect";
import { Search } from "lucide-react";
import { useState } from "react";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatReviewDate, formatReviewTime } from "#review/shared/format.ts";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

import { sourceListQuery } from "./source-queries.ts";

const styles = stylex.create({
  fitCell: { width: "1%", whiteSpace: "nowrap" },
  numericNoWrap: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  // The whole row is the quote's link (its ::after covers the row), so hover and keyboard focus light the row.
  row: {
    position: "relative",
    backgroundColor: {
      default: null,
      ":hover": "var(--mantine-color-gray-0)",
      ":focus-within": "var(--mantine-color-tastebud-0)",
    },
  },
  rowLink: {
    "::after": { content: "''", position: "absolute", inset: 0 },
    ":focus-visible": { outline: "none" },
  },
});

export const SourceListSearch = Schema.Struct({
  kind: Schema.optionalKey(Schema.String),
  speaker: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
});

const Route = getRouteApi("/sources/");

export function SourceListPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const catalog = useReviewCatalog();
  const [text, setText] = useState(search.text ?? "");
  const list = useQuery(sourceListQuery(search.kind, search.text));
  const sourceKinds = catalog?.sourceKinds ?? [];
  const speakers = [
    ...new Map((list.data ?? []).map((view) => [view.source.said_by, view.source.said_by_label])).entries(),
  ].sort(([, left], [, right]) => left.localeCompare(right));
  const rows = (list.data ?? []).filter(
    (view) => search.speaker === undefined || view.source.said_by === search.speaker,
  );
  const setFilter = (next: { kind?: string | undefined; speaker?: string | undefined; text?: string | undefined }) =>
    void navigate({
      search: (previous) => {
        const merged = { ...previous, ...next };
        return {
          ...(merged.kind !== undefined && { kind: merged.kind }),
          ...(merged.speaker !== undefined && { speaker: merged.speaker }),
          ...(merged.text !== undefined && merged.text !== "" && { text: merged.text }),
        };
      },
      replace: true,
    });
  const setTextFilter = useDebouncedCallback((value: string) => {
    const trimmed = value.trim();
    setFilter({ text: trimmed === "" ? undefined : trimmed });
  }, 250);
  const filtered = search.kind !== undefined || search.speaker !== undefined || search.text !== undefined;

  return (
    <Stack gap="md">
      <ReviewPageHeader
        title="Sources"
        purpose="People's exact words, as your agents saved them. Every conclusion cites at least one; open one to see what it led to."
        details="Sources are store-wide: they never carry a place."
      />
      <Group gap="sm">
        <TextInput
          size="xs"
          w={280}
          aria-label="Search the words"
          placeholder="Search the words"
          leftSection={<Search size={13} />}
          value={text}
          onChange={(event) => {
            setText(event.currentTarget.value);
            setTextFilter(event.currentTarget.value);
          }}
        />
        {sourceKinds.length > 1 && (
          <SegmentedControl
            size="xs"
            value={search.kind ?? "all"}
            data={[
              { value: "all", label: "All" },
              ...sourceKinds.map((kind) => ({ value: kind.key, label: capitalize(kind.plural) })),
            ]}
            onChange={(value) => setFilter({ kind: value === "all" ? undefined : value })}
          />
        )}
        <Select
          size="xs"
          w={240}
          placeholder="Said by anyone"
          aria-label="Said by"
          clearable
          searchable
          value={search.speaker ?? null}
          data={speakers.map(([account, label]) => ({ value: account, label: `${label} · ${account}` }))}
          onChange={(value) => setFilter({ speaker: value ?? undefined })}
        />
      </Group>

      <LoadedQueryContent query={list}>
        {() =>
          rows.length === 0 ? (
            <Center py="xxl">
              <Text c="dimmed">
                {filtered
                  ? "No sources match these filters."
                  : "Nothing saved yet. Your agents save words when you ask, and a catch-up finds the rest."}
              </Text>
            </Center>
          ) : (
            <Paper p={0}>
              <Table verticalSpacing="xs" horizontalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>
                      <Text size="xs" c="dimmed" fw={500}>
                        Words
                      </Text>
                    </Table.Th>
                    <Table.Th {...stylex.props(styles.fitCell)}>
                      <Text size="xs" c="dimmed" fw={500}>
                        Said by
                      </Text>
                    </Table.Th>
                    <Table.Th {...stylex.props(styles.fitCell)}>
                      <Text size="xs" c="dimmed" fw={500}>
                        Kind
                      </Text>
                    </Table.Th>
                    <Table.Th {...stylex.props(styles.fitCell)} ta="right">
                      <Text size="xs" c="dimmed" fw={500} title="How many conclusions cite these words">
                        Cited by
                      </Text>
                    </Table.Th>
                    <Table.Th w={96} ta="right">
                      <Text size="xs" c="dimmed" fw={500}>
                        Said
                      </Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((view) => (
                    <Table.Tr key={view.source.id} {...stylex.props(styles.row)}>
                      <Table.Td>
                        <AnchorLink
                          to="/sources/$id"
                          params={{ id: view.source.id }}
                          c="inherit"
                          size="sm"
                          underline="never"
                          lineClamp={2}
                          {...stylex.props(styles.rowLink)}
                        >
                          “{view.source.quote}”
                        </AnchorLink>
                      </Table.Td>
                      <Table.Td {...stylex.props(styles.fitCell)}>
                        <Text size="xs" c="dimmed">
                          {view.source.said_by_label}
                        </Text>
                      </Table.Td>
                      <Table.Td {...stylex.props(styles.fitCell)}>
                        <Text size="xs" c="dimmed">
                          {capitalize(view.kindLabel)}
                          {view.retired && " (retired)"}
                        </Text>
                      </Table.Td>
                      <Table.Td {...stylex.props(styles.fitCell)} ta="right">
                        {view.citedByCount === 0 ? (
                          <Text size="xs" c="dimmed">
                            Not yet
                          </Text>
                        ) : (
                          <Text size="xs" fw={500} {...stylex.props(styles.numericNoWrap)}>
                            {view.citedByCount}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td w={96} ta="right">
                        <Text
                          size="xs"
                          c="dimmed"
                          title={formatReviewTime(view.source.said_at)}
                          {...stylex.props(styles.numericNoWrap)}
                        >
                          {formatReviewDate(view.source.said_at)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )
        }
      </LoadedQueryContent>
    </Stack>
  );
}
