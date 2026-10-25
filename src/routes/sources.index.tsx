import {
  Center,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";

import { formatReviewDate, formatReviewTime } from "../ui/format.ts";
import { capitalize } from "../ui/kind-identity.tsx";
import { sourceListQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { AnchorLink } from "../ui/router-links.tsx";
import { useReviewCatalog } from "../ui/use-review-context.ts";

const SourceListSearch = Schema.Struct({
  kind: Schema.optionalKey(Schema.String),
  speaker: Schema.optionalKey(Schema.String),
});

export const Route = createFileRoute("/sources/")({
  validateSearch: Schema.toStandardSchemaV1(SourceListSearch),
  component: SourceListScreen,
});

function SourceListScreen() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const catalog = useReviewCatalog();
  const list = useQuery(sourceListQuery(search.kind));
  const sourceKinds = catalog?.sourceKinds ?? [];
  const speakers = [
    ...new Map((list.data ?? []).map((view) => [view.source.said_by, view.source.said_by_label])).entries(),
  ].sort(([, left], [, right]) => left.localeCompare(right));
  const rows = (list.data ?? []).filter(
    (view) => search.speaker === undefined || view.source.said_by === search.speaker,
  );
  const setFilter = (next: { kind?: string | undefined; speaker?: string | undefined }) =>
    void navigate({
      search: (previous) => {
        const merged = { ...previous, ...next };
        return {
          ...(merged.kind !== undefined && { kind: merged.kind }),
          ...(merged.speaker !== undefined && { speaker: merged.speaker }),
        };
      },
      replace: true,
    });

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Title order={3}>Sources</Title>
        <Text size="xs" c="dimmed">
          People's exact words, as captured. Every derivation cites at least one. Sources are store-wide: they never
          carry a scope.
        </Text>
      </Stack>
      <Group gap="sm">
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
          placeholder="Anyone"
          aria-label="Said by"
          clearable
          searchable
          value={search.speaker ?? null}
          data={speakers.map(([account, label]) => ({ value: account, label: `${label} · ${account}` }))}
          onChange={(value) => setFilter({ speaker: value ?? undefined })}
        />
      </Group>

      {list.error ? (
        <QueryErrorAlert error={list.error} />
      ) : list.data === undefined ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : rows.length === 0 ? (
        <Center py={60}>
          <Text c="dimmed">
            {search.kind !== undefined || search.speaker !== undefined
              ? "No sources match these filters."
              : "Nothing captured yet. Agents capture with taste capture."}
          </Text>
        </Center>
      ) : (
        <Paper p={0}>
          <Table verticalSpacing={8} horizontalSpacing="md" highlightOnHover>
            <Table.Tbody>
              {rows.map((view) => (
                <Table.Tr key={view.source.id}>
                  <Table.Td>
                    <AnchorLink
                      to="/sources/$id"
                      params={{ id: view.source.id }}
                      c="inherit"
                      size="sm"
                      underline="hover"
                      lineClamp={2}
                    >
                      “{view.source.quote}”
                    </AnchorLink>
                  </Table.Td>
                  <Table.Td style={{ width: "1%", whiteSpace: "nowrap" }}>
                    <Tooltip label={view.source.said_by} withArrow>
                      <Text size="xs" fw={500}>
                        {view.source.said_by_label}
                      </Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td style={{ width: "1%", whiteSpace: "nowrap" }}>
                    <Text size="xs" c="dimmed">
                      {view.kindLabel}
                      {view.retired && " (retired)"}
                    </Text>
                  </Table.Td>
                  <Table.Td w={96} ta="right">
                    <Text
                      size="xs"
                      c="dimmed"
                      title={formatReviewTime(view.source.said_at)}
                      style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatReviewDate(view.source.said_at)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
