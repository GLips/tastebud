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
import { describeSpeaker, formatReviewClock, formatReviewDate, formatReviewTime } from "#review/shared/format.ts";
import { DerivationRelationRow } from "#review/shared/ui/derivation-relation-row.tsx";
import { FactRow } from "#review/shared/ui/fact-row.tsx";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { PlaceChip } from "#review/shared/ui/place-chips.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SourceAddress } from "#review/shared/ui/source-address.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

const Route = getRouteApi("/sources/$id");

const styles = stylex.create({
  // A main column for the words and what they led to, and a properties column beside it, as on a derivation.
  layout: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", columnGap: "32px", alignItems: "start" },
  facts: {
    display: "grid",
    gridTemplateColumns: "72px minmax(0, 1fr)",
    columnGap: "10px",
    rowGap: "8px",
    alignItems: "baseline",
  },
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

/** The source's properties, Linear-style: who said it, when and where, what kind it is, and its record-keeping. */
function SourceProperties({
  view,
  labelOf,
  owner,
}: {
  view: SourceView;
  labelOf: (place: string) => string;
  owner: string | undefined;
}) {
  const { source } = view;
  return (
    <Paper p="md">
      <Box {...stylex.props(styles.facts)}>
        <FactRow label="Said by">
          <Text size="sm">{describeSpeaker(source, owner)}</Text>
        </FactRow>
        <FactRow label="When">
          <Text size="sm">{formatReviewTime(source.said_at)}</Text>
        </FactRow>
        {source.captured_in !== undefined && source.captured_in.length > 0 && (
          <FactRow label="Where">
            <Group gap="2xs">
              {source.captured_in.map((place) => (
                <PlaceChip key={place} place={place} label={labelOf(place)} />
              ))}
            </Group>
          </FactRow>
        )}
        {source.address !== undefined && (
          <FactRow label="From">
            <SourceAddress address={source.address} variant="line" />
          </FactRow>
        )}
        <FactRow label="Kind">
          <Text size="sm">
            {capitalize(view.kindLabel)}
            {view.retired && " (retired)"}
          </Text>
        </FactRow>
        <FactRow label="Captured">
          <Text size="sm">{formatReviewTime(source.captured_at)}</Text>
        </FactRow>
        <FactRow label="Via">
          <Text size="sm">{source.captured_via}</Text>
        </FactRow>
        <FactRow label="ID">
          <CopyButton value={source.id}>
            {({ copied, copy }) => (
              <UnstyledButton onClick={copy} title="Copy the full id, for the CLI and agents">
                <Group gap="2xs" wrap="nowrap">
                  <Text size="sm" ff="monospace">
                    {shortIdOf(source.id)}
                  </Text>
                  {copied ? <Check size={12} aria-label="Copied" /> : <Copy size={12} aria-hidden />}
                </Group>
              </UnstyledButton>
            )}
          </CopyButton>
        </FactRow>
      </Box>
    </Paper>
  );
}

/** Earlier words these revise, and later words that revise these, as linked rows. Nothing when neither exists. */
function SourceRevisions({ view, revisedBy }: { view: SourceView; revisedBy: ReadonlyArray<SourceRecord> }) {
  const { revises } = view.source;
  if (revises === undefined && revisedBy.length === 0) return null;
  const rows = [
    ...(revises === undefined ? [] : [{ id: revises, relation: "Revises", quote: undefined }]),
    ...revisedBy.map((later) => ({ id: later.id, relation: "Revised by", quote: later.quote })),
  ];
  return (
    <Stack gap="xs">
      <Text size="md" fw={600}>
        Revisions
      </Text>
      <Paper p={0}>
        <Table verticalSpacing="xs" horizontalSpacing="md">
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.id} {...stylex.props(styles.row)}>
                <Table.Td {...stylex.props(styles.fitCell)}>
                  <SupportingText tier="secondary">{row.relation}</SupportingText>
                </Table.Td>
                <Table.Td>
                  <AnchorLink
                    to="/sources/$id"
                    params={{ id: row.id }}
                    c="inherit"
                    size="sm"
                    underline="never"
                    lineClamp={2}
                    {...stylex.props(styles.rowLink)}
                  >
                    {row.quote === undefined ? `An earlier ${view.kindLabel}` : `“${row.quote}”`}
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
        <SupportingText tier="secondary">Nothing cites these words yet.</SupportingText>
      ) : (
        <Paper p={0}>
          {cited.map((citation) => (
            <DerivationRelationRow
              key={citation.id}
              tag={CITATION_ROLE_WORDS[citation.role]}
              summary={citation}
              catalog={catalog}
              labels={known.labels}
            />
          ))}
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
  owner,
}: {
  title: string;
  neighbours: ReadonlyArray<SourceView>;
  /** How a neighbour's moment reads: its clock time beside the same conversation, its date otherwise. */
  when: (saidAt: string) => string;
  /** Every row has the page's speaker, so the speaker column would only repeat the heading. */
  bySpeaker: boolean;
  owner: string | undefined;
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
                    <SupportingText tier="secondary">{describeSpeaker(neighbour.source, owner)}</SupportingText>
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
  const owner = useReviewCatalog()?.owner;

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
      <AnchorLink to="/sources" size="sm" c="gray.7" underline="hover" aria-label="Back to all sources">
        <Group gap="2xs">
          <ArrowLeft size={14} aria-hidden />
          Sources
        </Group>
      </AnchorLink>

      <Box {...stylex.props(styles.layout)}>
        <Stack gap="lg">
          <Stack gap="sm">
            {source.before !== undefined && (
              <SupportingText tier="secondary" {...stylex.props(styles.around)}>
                …{source.before}
              </SupportingText>
            )}
            {/* The words are the page's title: who said them and when sit in the properties beside them. */}
            <Text component="h1" fz="sourceQuote" m={0} {...stylex.props(styles.quote)}>
              “{source.quote}”
            </Text>
            {source.after !== undefined && (
              <SupportingText tier="secondary" {...stylex.props(styles.around)}>
                {source.after}…
              </SupportingText>
            )}
          </Stack>
          <SourceRevisions view={view} revisedBy={detail.data.revisedBy} />

          <SourceLedTo cited={detail.data.citedBy} />
          {detail.data.saidAlongside.length > 0 ? (
            <SourceNeighbours
              title="Said around the same time"
              neighbours={nearestNeighboursOf(source.said_at, detail.data.saidAlongside)}
              when={formatReviewClock}
              bySpeaker={false}
              owner={owner}
            />
          ) : (
            <SourceNeighbours
              title={source.said_by === owner ? "More from you" : `More from ${source.said_by_label}`}
              neighbours={detail.data.moreFromSpeaker}
              when={formatReviewDate}
              bySpeaker
              owner={owner}
            />
          )}
        </Stack>
        <SourceProperties view={view} labelOf={known.labelOf} owner={owner} />
      </Box>
    </Stack>
  );
}
