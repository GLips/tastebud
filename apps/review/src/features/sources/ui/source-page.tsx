import {
  Alert,
  Box,
  Center,
  CopyButton,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import type { Citation, SourceView } from "@tastebud/core/record-views";
import type { SourceRecord } from "@tastebud/core/records";
import { shortIdOf } from "@tastebud/core/taste-vocabulary";
import { ArrowLeft, Check, Copy } from "lucide-react";

import { recordDetailQuery, useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatReviewClock, formatReviewDate, formatReviewTime } from "#review/shared/format.ts";
import { capitalize, KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { PlaceChip, ScopeChips } from "#review/shared/ui/place-chips.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SourceAddress } from "#review/shared/ui/source-address.tsx";
import { DerivationStatusLabel } from "#review/shared/ui/status-chips.tsx";
import { SubjectLabel } from "#review/shared/ui/subject-label.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

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

/** What the quote is and where it was said, in words a person reads; the speaker and date are the title. */
function SourceFacts({ view, labelOf }: { view: SourceView; labelOf: (place: string) => string }) {
  const { source } = view;
  return (
    <Group gap="xs" wrap="wrap" align="center">
      <SupportingText tier="secondary">
        {capitalize(view.kindLabel)}
        {view.retired && " (retired kind)"} · said at {formatReviewClock(source.said_at)}
      </SupportingText>
      {source.captured_in !== undefined && source.captured_in.length > 0 && (
        <Group gap="2xs" wrap="nowrap">
          <Tooltip
            label="Where the capture happened. Provenance only: it never decides where anything applies."
            withArrow
            multiline
            w={260}
          >
            <SupportingText tier="secondary">in</SupportingText>
          </Tooltip>
          {source.captured_in.map((place) => (
            <PlaceChip key={place} place={place} label={labelOf(place)} />
          ))}
        </Group>
      )}
      {source.address !== undefined && <SourceAddress address={source.address} variant="action" />}
    </Group>
  );
}

/** The record-keeping: when and by what the words were captured, and the id for the CLI. */
function SourceRecordMeta({ source }: { source: SourceRecord }) {
  return (
    <Group gap="xs" wrap="wrap" align="center">
      <SupportingText tier="faint">
        Captured {formatReviewTime(source.captured_at)} by {source.captured_via}
      </SupportingText>
      <CopyButton value={source.id}>
        {({ copied, copy }) => (
          <UnstyledButton onClick={copy} title="Copy the full id, for the CLI and agents">
            <Group gap="3xs" wrap="nowrap">
              {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
              <SupportingText tier="faint" span>
                {copied ? "Copied" : `Copy id ${shortIdOf(source.id)}`}
              </SupportingText>
            </Group>
          </UnstyledButton>
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
        <SupportingText tier="secondary">
          These words revise{" "}
          <AnchorLink to="/sources/$id" params={{ id: revises }} size="sm">
            an earlier {view.kindLabel}
          </AnchorLink>
          .
        </SupportingText>
      )}
      {revisedBy.map((later) => (
        <SupportingText tier="secondary" key={later.id} lineClamp={1}>
          Revised later:{" "}
          <AnchorLink to="/sources/$id" params={{ id: later.id }} size="sm">
            “{later.quote}”
          </AnchorLink>
        </SupportingText>
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
        <SupportingText tier="secondary">
          No conclusions cite these words yet. Your agent proposes from saved words when you catch up with
          /tastebud:review, and anything it proposes lands in your inbox.
        </SupportingText>
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
                        <SupportingText tier="secondary" span>
                          <SubjectLabel summary={citation} owner={catalog?.owner} />
                        </SupportingText>
                      </Text>
                    </Group>
                    {citation.reason !== undefined && (
                      <SupportingText tier="secondary" lineClamp={1}>
                        {capitalize(citation.status)}: “{citation.reason}”
                      </SupportingText>
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
 * Other quotes beside this one, each opening its own page: what was said in the same conversation (the same
 * meeting, thread or Claude Code session) or, when the store links none, the same speaker's latest words.
 */
function SourceNeighbours({
  title,
  neighbours,
  when,
  bySpeaker,
}: {
  title: string;
  neighbours: ReadonlyArray<SourceView>;
  /** How a neighbour's moment reads: its clock time beside the same conversation, its date otherwise. */
  when: (saidAt: string) => string;
  /** Every row has the page's speaker, so the speaker column would only repeat the heading. */
  bySpeaker: boolean;
}) {
  if (neighbours.length === 0) return null;
  return (
    <Stack gap="xs">
      <Text size="md" fw={600}>
        {title}
      </Text>
      <Paper p={0}>
        <Table verticalSpacing="xs" horizontalSpacing="md">
          <Table.Tbody>
            {neighbours.map((neighbour) => (
              <Table.Tr key={neighbour.source.id} {...stylex.props(styles.row)}>
                <Table.Td {...stylex.props(styles.fitCell)}>
                  <SupportingText tier="secondary" {...stylex.props(styles.numericNoWrap)}>
                    {when(neighbour.source.said_at)}
                  </SupportingText>
                </Table.Td>
                {!bySpeaker && (
                  <Table.Td {...stylex.props(styles.fitCell)}>
                    <SupportingText tier="secondary">{neighbour.source.said_by_label}</SupportingText>
                  </Table.Td>
                )}
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
        title={`${source.said_by_label} · ${formatReviewDate(source.said_at)}`}
        purpose="Their exact words, as saved, and the conclusions your agents drew from them."
      />

      <Stack gap="sm" {...stylex.props(styles.body)}>
        {source.before !== undefined && (
          <SupportingText tier="secondary" {...stylex.props(styles.around)}>
            …{source.before}
          </SupportingText>
        )}
        <Text component="blockquote" fz="sourceQuote" m={0} {...stylex.props(styles.quote)}>
          “{source.quote}”
        </Text>
        {source.after !== undefined && (
          <SupportingText tier="secondary" {...stylex.props(styles.around)}>
            {source.after}…
          </SupportingText>
        )}
        <SourceFacts view={view} labelOf={known.labelOf} />
        <SourceRecordMeta source={source} />
        <SourceRevisions view={view} revisedBy={detail.data.revisedBy} />
      </Stack>

      <SourceLedTo cited={detail.data.citedBy} />
      {detail.data.saidAlongside.length > 0 ? (
        <SourceNeighbours
          title="Said around the same time"
          neighbours={nearestNeighboursOf(source.said_at, detail.data.saidAlongside)}
          when={formatReviewClock}
          bySpeaker={false}
        />
      ) : (
        <SourceNeighbours
          title={`More from ${source.said_by_label}`}
          neighbours={detail.data.moreFromSpeaker}
          when={formatReviewDate}
          bySpeaker
        />
      )}
    </Stack>
  );
}
