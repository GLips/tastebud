import { Center, Group, Paper, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import type { SourceRow } from "@tastebud/core/record-browsing";
import { Schema } from "effect";
import { ArrowDownUp, Search, UserRound } from "lucide-react";
import { useState } from "react";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { describeSpeaker, formatReviewDate, formatReviewTime } from "#review/shared/format.ts";
import { CountedTabs } from "#review/shared/ui/counted-tabs.tsx";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { ListSectionHeader } from "#review/shared/ui/list-section-header.tsx";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import { sourceListQuery } from "./source-queries.ts";
import { SourceSpeaker } from "./source-speaker.tsx";

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
  // Cells with their own link sit above the row's cover.
  aboveRowLink: { position: "relative", zIndex: 1 },
  rowLink: {
    "::after": { content: "''", position: "absolute", inset: 0 },
    ":focus-visible": { outline: "none" },
  },
});

const SOURCE_SECTION_KEYS = ["led-to", "unused"] as const;
type SourceSectionKey = (typeof SOURCE_SECTION_KEYS)[number];

const SOURCE_SORTS = ["cited", "newest", "oldest"] as const;
type SourceSort = (typeof SOURCE_SORTS)[number];

const SOURCE_SORT_LABELS: Record<SourceSort, string> = { cited: "Most cited", newest: "Newest", oldest: "Oldest" };

const newestSaidFirst = (left: SourceRow, right: SourceRow) => right.source.said_at.localeCompare(left.source.said_at);

const SOURCE_SORT_ORDERS: Record<SourceSort, (left: SourceRow, right: SourceRow) => number> = {
  cited: (left, right) => right.citedByCount - left.citedByCount || newestSaidFirst(left, right),
  newest: newestSaidFirst,
  oldest: (left, right) => left.source.said_at.localeCompare(right.source.said_at),
};

export const SourceListSearch = Schema.Struct({
  /** Most cited first when absent. */
  sort: Schema.optionalKey(Schema.Literals(SOURCE_SORTS)),
  kind: Schema.optionalKey(Schema.String),
  /** Sections folded shut; both are open by default. */
  closed: Schema.optionalKey(Schema.Array(Schema.Literals(SOURCE_SECTION_KEYS))),
  speaker: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
});

const Route = getRouteApi("/sources/");

/** The list's two sections, in this order: words a conclusion cites, then words nothing cites yet. */
const SOURCE_SECTIONS: ReadonlyArray<{ key: SourceSectionKey; title: string; cited: boolean }> = [
  { key: "led-to", title: "Led to something", cited: true },
  { key: "unused", title: "Not used yet", cited: false },
];

/** Rows in their sections, each in the picked order; a section with no rows has no header. */
const groupSourceRowsByUse = (rows: ReadonlyArray<SourceRow>, sort: SourceSort) =>
  SOURCE_SECTIONS.map((section) =>
    Object.assign(
      { rows: rows.filter((row) => row.citedByCount > 0 === section.cited).toSorted(SOURCE_SORT_ORDERS[sort]) },
      section,
    ),
  ).filter((section) => section.rows.length > 0);

/** A section's header row, which folds the section: its chevron, title and count. */
function SourceSectionHeader({
  title,
  count,
  open,
  onToggle,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <ListSectionHeader
      title={title}
      count={count}
      fold={{ open, onToggle }}
      frame={{ kind: "table-row", columns: 4 }}
    />
  );
}

/** One saved quote: the words (the row opens them), who said them, what they led to and when. */
function SourceListRow({ view, owner }: { view: SourceRow; owner: string | undefined }) {
  return (
    <Table.Tr {...stylex.props(styles.row)}>
      <Table.Td>
        <AnchorLink
          to="/sources/$id"
          params={{ id: view.source.id }}
          c={view.citedByCount === 0 ? "gray.7" : "inherit"}
          size="sm"
          underline="never"
          lineClamp={2}
          {...stylex.props(styles.rowLink)}
        >
          “{view.source.quote}”
        </AnchorLink>
      </Table.Td>
      <Table.Td {...stylex.props(styles.fitCell)}>
        <SourceSpeaker source={view.source} owner={owner} />
      </Table.Td>
      <Table.Td {...stylex.props(styles.fitCell)} ta="right">
        {view.citedByCount > 0 && (
          <AnchorLink
            to="/sources/$id"
            params={{ id: view.source.id }}
            hash="led-to"
            size="sm"
            c="gray.7"
            underline="hover"
            title="See what these words led to"
            {...stylex.props(styles.numericNoWrap, styles.aboveRowLink)}
          >
            {view.citedByCount}
          </AnchorLink>
        )}
      </Table.Td>
      <Table.Td w={96} ta="right">
        <SupportingText
          tier="secondary"
          title={formatReviewTime(view.source.said_at)}
          {...stylex.props(styles.numericNoWrap)}
        >
          {formatReviewDate(view.source.said_at)}
        </SupportingText>
      </Table.Td>
    </Table.Tr>
  );
}

export function SourceListPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const catalog = useReviewCatalog();
  const [text, setText] = useState(search.text ?? "");
  const list = useQuery(sourceListQuery(search.kind, search.text));
  const sourceKinds = catalog?.sourceKinds ?? [];
  const speakers = [
    ...new Map(
      (list.data ?? []).map((view) => [view.source.said_by, describeSpeaker(view.source, catalog?.owner)]),
    ).entries(),
  ].sort(([, left], [, right]) => left.localeCompare(right));
  const rows = (list.data ?? []).filter(
    (view) => search.speaker === undefined || view.source.said_by === search.speaker,
  );
  const closed = search.closed ?? [];
  const setFilter = (next: {
    kind?: string | undefined;
    speaker?: string | undefined;
    text?: string | undefined;
    closed?: ReadonlyArray<SourceSectionKey>;
    sort?: SourceSort | undefined;
  }) =>
    void navigate({
      search: (previous) => {
        const merged = { ...previous, ...next };
        return {
          ...(merged.kind !== undefined && { kind: merged.kind }),
          ...(merged.sort !== undefined && merged.sort !== "cited" && { sort: merged.sort }),
          ...(merged.closed !== undefined && merged.closed.length > 0 && { closed: merged.closed }),
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
      <ReviewPageHeader title="Sources" />
      <Group gap="sm">
        <TextInput
          w={320}
          aria-label="Search the words"
          placeholder="Search the words"
          leftSection={<Search size={14} />}
          value={text}
          onChange={(event) => {
            setText(event.currentTarget.value);
            setTextFilter(event.currentTarget.value);
          }}
        />
        {sourceKinds.length > 1 && (
          <CountedTabs
            label="Kind"
            value={search.kind ?? "all"}
            options={[
              { value: "all", label: "All" },
              ...sourceKinds.map((kind) => ({ value: kind.key, label: capitalize(kind.plural) })),
            ]}
            onChange={(value) => setFilter({ kind: value === "all" ? undefined : value })}
          />
        )}
        <Select
          w={220}
          leftSection={<UserRound size={14} />}
          placeholder="Said by anyone"
          aria-label="Said by"
          clearable
          searchable
          value={search.speaker ?? null}
          data={speakers.map(([account, label]) => ({ value: account, label: `${label} · ${account}` }))}
          onChange={(value) => setFilter({ speaker: value ?? undefined })}
        />
        <Select
          w={160}
          leftSection={<ArrowDownUp size={14} />}
          aria-label="Sort"
          allowDeselect={false}
          value={search.sort ?? "cited"}
          data={SOURCE_SORTS.map((value) => ({ value, label: SOURCE_SORT_LABELS[value] }))}
          onChange={(value) => setFilter({ sort: SOURCE_SORTS.find((sort) => sort === value) })}
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
              <Table
                verticalSpacing="xs"
                horizontalSpacing="md"
                stickyHeader
                stickyHeaderOffset="var(--review-shell-header-height)"
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>
                      <Text size="xs" c="gray.7" fw={600}>
                        Words
                      </Text>
                    </Table.Th>
                    <Table.Th {...stylex.props(styles.fitCell)}>
                      <Text size="xs" c="gray.7" fw={600}>
                        Said by
                      </Text>
                    </Table.Th>
                    <Table.Th {...stylex.props(styles.fitCell)} ta="right">
                      <Text size="xs" c="gray.7" fw={600} title="How many conclusions cite these words">
                        Led to
                      </Text>
                    </Table.Th>
                    <Table.Th w={96} ta="right">
                      <Text size="xs" c="gray.7" fw={600}>
                        Said
                      </Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {groupSourceRowsByUse(rows, search.sort ?? "cited").flatMap((section) =>
                    [
                      <SourceSectionHeader
                        key={section.key}
                        title={section.title}
                        count={section.rows.length}
                        open={!closed.includes(section.key)}
                        onToggle={() =>
                          setFilter({
                            closed: closed.includes(section.key)
                              ? closed.filter((key) => key !== section.key)
                              : [...closed, section.key],
                          })
                        }
                      />,
                    ].concat(
                      (closed.includes(section.key) ? [] : section.rows).map((view) => (
                        <SourceListRow key={view.source.id} view={view} owner={catalog?.owner} />
                      )),
                    ),
                  )}
                </Table.Tbody>
              </Table>
            </Paper>
          )
        }
      </LoadedQueryContent>
    </Stack>
  );
}
