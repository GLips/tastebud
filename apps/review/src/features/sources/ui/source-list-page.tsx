import {
  Center,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import type { SourceRow } from "@tastebud/core/record-browsing";
import { Schema } from "effect";
import { ChevronDown, ChevronRight, Search, UserRound } from "lucide-react";
import { useState } from "react";

import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { describeSpeaker, formatReviewDate, formatReviewTime } from "#review/shared/format.ts";
import { CountBadge } from "#review/shared/ui/count-badge.tsx";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

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
  // Cells with their own link sit above the row's cover.
  groupRow: { backgroundColor: "var(--mantine-color-gray-0)" },
  sectionToggle: { width: "100%" },
  aboveRowLink: { position: "relative", zIndex: 1 },
  rowLink: {
    "::after": { content: "''", position: "absolute", inset: 0 },
    ":focus-visible": { outline: "none" },
  },
});

const SOURCE_SECTION_KEYS = ["led-to", "unused"] as const;
type SourceSectionKey = (typeof SOURCE_SECTION_KEYS)[number];

export const SourceListSearch = Schema.Struct({
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

/** Most cited first, then newest: the words that led to the most come up top. */
const bySourceUse = (left: SourceRow, right: SourceRow) =>
  right.citedByCount - left.citedByCount || right.source.said_at.localeCompare(left.source.said_at);

/** Rows in their sections; a section with no rows has no header. */
const groupSourceRowsByUse = (rows: ReadonlyArray<SourceRow>) =>
  SOURCE_SECTIONS.map((section) =>
    Object.assign(
      { rows: rows.filter((row) => row.citedByCount > 0 === section.cited).toSorted(bySourceUse) },
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
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <Table.Tr {...stylex.props(styles.groupRow)}>
      <Table.Td colSpan={4} py="xxs" pl="xs">
        <UnstyledButton onClick={onToggle} aria-expanded={open} {...stylex.props(styles.sectionToggle)}>
          <Group gap="xs" wrap="nowrap">
            <Chevron size={14} color="var(--mantine-color-gray-6)" aria-hidden />
            <Text size="sm" fw={600}>
              {title}
            </Text>
            <CountBadge count={count} />
          </Group>
        </UnstyledButton>
      </Table.Td>
    </Table.Tr>
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
        <SupportingText tier="secondary">{describeSpeaker(view.source, owner)}</SupportingText>
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
  }) =>
    void navigate({
      search: (previous) => {
        const merged = { ...previous, ...next };
        return {
          ...(merged.kind !== undefined && { kind: merged.kind }),
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
          <SegmentedControl
            value={search.kind ?? "all"}
            data={[
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
                        Cited by
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
                  {groupSourceRowsByUse(rows).flatMap((section) =>
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
