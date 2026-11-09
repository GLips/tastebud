import {
  Alert,
  Box,
  Button,
  Center,
  CopyButton,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import type { Citation, SourceView } from "@tastebud/core/record-views";
import type { SourceRecord } from "@tastebud/core/records";
import { ArrowLeft, Check, Copy } from "lucide-react";

import { recordDetailQuery, useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatReviewTime } from "#review/shared/format.ts";
import { capitalize, KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { PlaceChip, ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SourceAddress } from "#review/shared/ui/source-address.tsx";
import { DerivationStatusLabel } from "#review/shared/ui/status-chips.tsx";
import { SubjectLabel } from "#review/shared/ui/subject-label.tsx";

const Route = getRouteApi("/sources/$id");

const styles = stylex.create({
  // The quote keeps a reading measure inside the shared page width.
  body: { maxWidth: "72ch" },
  quote: { lineHeight: 1.45, fontWeight: 500, whiteSpace: "pre-wrap", textWrap: "pretty" },
  around: { whiteSpace: "pre-wrap" },
  fitCell: { width: "1%", whiteSpace: "nowrap" },
  numericNoWrap: { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  // A row's main link covers the row (its ::after); cells with their own controls sit above that cover.
  row: {
    position: "relative",
    backgroundColor: {
      default: null,
      ":hover": "var(--mantine-color-gray-0)",
      ":focus-within": "var(--mantine-color-gray-0)",
    },
  },
  rowLink: {
    "::after": { content: "''", position: "absolute", inset: 0 },
    ":focus-visible": { outline: "none" },
  },
  aboveRowLink: { position: "relative", zIndex: 1 },
});

/** Words of a quote that fit a page title; the full quote is the page's hero right below it. */
const TITLE_QUOTE_WORDS = 8;

const shortQuoteOf = (quote: string) => {
  const words = quote.split(/\s+/);
  return words.length <= TITLE_QUOTE_WORDS ? quote : `${words.slice(0, TITLE_QUOTE_WORDS).join(" ")}…`;
};

/** How many neighbouring quotes to show: the ones said closest in time, then in the order they were said. */
const NEIGHBOUR_LIMIT = 6;

const nearestNeighboursOf = (saidAt: string, neighbours: ReadonlyArray<SourceView>) => {
  const at = Date.parse(saidAt);
  const distance = (view: SourceView) => Math.abs(Date.parse(view.source.said_at) - at);
  return neighbours
    .toSorted((left, right) => distance(left) - distance(right))
    .slice(0, NEIGHBOUR_LIMIT)
    .toSorted((left, right) => left.source.said_at.localeCompare(right.source.said_at));
};

const CITATION_ROLE_WORDS: Record<Citation["role"], string> = {
  supports: "Supports",
  contradicts: "Contradicts",
};

/** One line of facts under the quote: who, when, how it was captured, where and kind, and the id to copy. */
function SourceMeta({ view, labelOf }: { view: SourceView; labelOf: (place: string) => string }) {
  const { source } = view;
  return (
    <Group gap="xs" wrap="wrap" align="center">
      <Text size="sm" c="gray.7">
        {source.said_by_label} · said {formatReviewTime(source.said_at)} · captured{" "}
        {formatReviewTime(source.captured_at)} by {source.captured_via} · {capitalize(view.kindLabel)}
        {view.retired && " (retired kind)"}
      </Text>
      {source.captured_in !== undefined && source.captured_in.length > 0 && (
        <Group gap="2xs" wrap="nowrap">
          <Tooltip
            label="Where the capture happened. Provenance only: it never decides where anything applies."
            withArrow
            multiline
            w={260}
          >
            <Text size="sm" c="gray.7">
              in
            </Text>
          </Tooltip>
          {source.captured_in.map((place) => (
            <PlaceChip key={place} place={place} label={labelOf(place)} />
          ))}
        </Group>
      )}
      {source.address !== undefined && <SourceAddress address={source.address} variant="action" />}
      <CopyButton value={source.id}>
        {({ copied, copy }) => (
          <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            title="For the CLI and agents"
            leftSection={copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
            onClick={copy}
          >
            {copied ? "Copied" : "Copy id"}
          </Button>
        )}
      </CopyButton>
    </Group>
  );
}

/** Earlier words these revise, and later words that revise these. Nothing when neither exists. */
function SourceRevisions({ view, revisedBy }: { view: SourceView; revisedBy: ReadonlyArray<SourceRecord> }) {
  const { revises } = view.source;
  if (revises === undefined && revisedBy.length === 0) return null;
  return (
    <Stack gap="3xs">
      {revises !== undefined && (
        <Text size="sm" c="gray.7">
          These words revise{" "}
          <AnchorLink to="/sources/$id" params={{ id: revises }} size="sm">
            an earlier {view.kindLabel}
          </AnchorLink>
          .
        </Text>
      )}
      {revisedBy.map((later) => (
        <Text key={later.id} size="sm" c="gray.7" lineClamp={1}>
          Revised later:{" "}
          <AnchorLink to="/sources/$id" params={{ id: later.id }} size="sm">
            “{later.quote}”
          </AnchorLink>
        </Text>
      ))}
    </Stack>
  );
}

/**
 * The conclusions that cite these words, in the library's row form: where each stands, its wording (the row
 * opens it), the places it applies, and whether it cites these words as support or as contradiction.
 */
function SourceLedTo({ cited }: { cited: ReadonlyArray<Citation> }) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces();
  return (
    <Stack gap="xs" id="led-to">
      <Text size="md" fw={600}>
        Led to{" "}
        {cited.length > 0 && (
          <Text span c="gray.7">
            {cited.length}
          </Text>
        )}
      </Text>
      {cited.length === 0 ? (
        <Text size="sm" c="gray.7">
          No conclusions cite these words yet. Your agent proposes from saved words when you catch up with
          /tastebud:review, and anything it proposes lands in your inbox.
        </Text>
      ) : (
        <Paper p={0}>
          <Table verticalSpacing="xs" horizontalSpacing="md">
            <Table.Tbody>
              {cited.map((citation) => (
                <Table.Tr key={citation.id} {...stylex.props(styles.row)}>
                  <Table.Td {...stylex.props(styles.fitCell)}>
                    <Box {...stylex.props(styles.aboveRowLink)}>
                      <DerivationStatusLabel status={citation.status} />
                    </Box>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap" align="baseline">
                      <KindGlyph catalog={catalog} kind={citation.kind} label={citation.kindLabel} size={10} />
                      <Text size="sm" lineClamp={2}>
                        <AnchorLink
                          to="/derivations/$id"
                          params={{ id: citation.id }}
                          c="inherit"
                          fw={500}
                          size="sm"
                          underline="never"
                          {...stylex.props(styles.rowLink)}
                        >
                          {citation.statement}
                        </AnchorLink>{" "}
                        <Text span size="sm" c="gray.7">
                          <SubjectLabel summary={citation} owner={catalog?.owner} />
                        </Text>
                      </Text>
                    </Group>
                    {citation.reason !== undefined && (
                      <Text size="sm" c="gray.7" lineClamp={1}>
                        {capitalize(citation.status)}: “{citation.reason}”
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td {...stylex.props(styles.fitCell)}>
                    <Box {...stylex.props(styles.aboveRowLink)}>
                      <ScopeChips scope={citation.effectiveScope} labels={known.labels} />
                    </Box>
                  </Table.Td>
                  <Table.Td {...stylex.props(styles.fitCell)} ta="right">
                    <Text size="sm" c={citation.role === "contradicts" ? "red.8" : "gray.7"}>
                      {CITATION_ROLE_WORDS[citation.role]}
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

/**
 * Other words from the same conversation (the same meeting, thread or Claude Code session), so a quote can be
 * read with what was said around it. Nothing when the store links no others.
 */
function SaidAroundTheSameTime({ saidAt, neighbours }: { saidAt: string; neighbours: ReadonlyArray<SourceView> }) {
  if (neighbours.length === 0) return null;
  const shown = nearestNeighboursOf(saidAt, neighbours);
  return (
    <Stack gap="xs">
      <Text size="md" fw={600}>
        Said around the same time
      </Text>
      <Paper p={0}>
        <Table verticalSpacing="xs" horizontalSpacing="md">
          <Table.Tbody>
            {shown.map((neighbour) => (
              <Table.Tr key={neighbour.source.id} {...stylex.props(styles.row)}>
                <Table.Td {...stylex.props(styles.fitCell)}>
                  <Text size="sm" c="gray.7" {...stylex.props(styles.numericNoWrap)}>
                    {formatReviewTime(neighbour.source.said_at)}
                  </Text>
                </Table.Td>
                <Table.Td {...stylex.props(styles.fitCell)}>
                  <Text size="sm" c="gray.7">
                    {neighbour.source.said_by_label}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <AnchorLink
                    to="/sources/$id"
                    params={{ id: neighbour.source.id }}
                    c="inherit"
                    size="sm"
                    underline="never"
                    lineClamp={2}
                    {...stylex.props(styles.rowLink)}
                  >
                    “{neighbour.source.quote}”
                  </AnchorLink>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}

export function SourcePage() {
  const { id } = Route.useParams();
  const detail = useQuery(recordDetailQuery(id));
  const known = useKnownPlaces();

  if (detail.error) return <QueryErrorAlert error={detail.error} />;
  if (detail.data === undefined) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }
  const view = detail.data.source;
  if (view === undefined) {
    return (
      <Alert color="gray" title="Not a source">
        This record is a {detail.data.record.type}.{" "}
        {detail.data.record.type === "Derivation" && (
          <AnchorLink to="/derivations/$id" params={{ id: detail.data.record.id }}>
            Open it
          </AnchorLink>
        )}
      </Alert>
    );
  }
  const { source } = view;

  return (
    <Stack gap="lg">
      <ReviewPageHeader
        crumb={
          <AnchorLink to="/sources" size="sm" c="gray.7" underline="hover" aria-label="Back to all sources">
            <Group gap="2xs">
              <ArrowLeft size={14} aria-hidden />
              Sources
            </Group>
          </AnchorLink>
        }
        title={`${source.said_by_label}: “${shortQuoteOf(source.quote)}”`}
        purpose="Their exact words, as saved, and the conclusions your agents drew from them."
      />

      <Stack gap="sm" {...stylex.props(styles.body)}>
        {source.before !== undefined && (
          <Text size="sm" c="gray.7" {...stylex.props(styles.around)}>
            …{source.before}
          </Text>
        )}
        <Text component="blockquote" fz="sourceQuote" m={0} {...stylex.props(styles.quote)}>
          “{source.quote}”
        </Text>
        {source.after !== undefined && (
          <Text size="sm" c="gray.7" {...stylex.props(styles.around)}>
            {source.after}…
          </Text>
        )}
        <SourceMeta view={view} labelOf={known.labelOf} />
        <SourceRevisions view={view} revisedBy={detail.data.revisedBy} />
      </Stack>

      <SourceLedTo cited={detail.data.citedBy} />
      <SaidAroundTheSameTime saidAt={source.said_at} neighbours={detail.data.saidAlongside} />
    </Stack>
  );
}
