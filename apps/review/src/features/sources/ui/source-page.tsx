import { Alert, Center, CopyButton, Group, Loader, Paper, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import type { Citation, SourceView } from "@tastebud/core/record-views";
import type { SourceRecord } from "@tastebud/core/records";
import { shortIdOf } from "@tastebud/core/taste-vocabulary";
import { ArrowLeft } from "lucide-react";

import { recordDetailQuery, useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatReviewDate, formatReviewTime } from "#review/shared/format.ts";
import { DerivationSummaryLine } from "#review/shared/ui/derivation-link.tsx";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { PlaceChip } from "#review/shared/ui/place-chips.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SourceAddress } from "#review/shared/ui/source-address.tsx";

const Route = getRouteApi("/sources/$id");

const styles = stylex.create({
  // The quote keeps a reading measure inside the shared page width.
  body: { maxWidth: "72ch" },
  quote: { lineHeight: 1.45, fontWeight: 500, whiteSpace: "pre-wrap", textWrap: "pretty" },
  around: { whiteSpace: "pre-wrap" },
  citationRole: { width: "88px", flexShrink: 0 },
  id: { fontFamily: "var(--mantine-font-family-monospace)" },
});

const CITATION_ROLE_WORDS: Record<Citation["role"], string> = {
  supports: "Supports",
  contradicts: "Contradicts",
};

/** One quiet line of facts under the quote: who, when, how it was captured, where, kind and id. */
function SourceMeta({ view, labelOf }: { view: SourceView; labelOf: (place: string) => string }) {
  const { source } = view;
  return (
    <Group gap="xs" wrap="wrap" align="center">
      <Text size="sm" c="gray.7">
        {source.said_by_label}{" "}
        <Text span size="xs" c="dimmed">
          ({source.said_by})
        </Text>{" "}
        · said {formatReviewTime(source.said_at)} · captured {formatReviewTime(source.captured_at)} by{" "}
        {source.captured_via} · {capitalize(view.kindLabel)}
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
          <UnstyledButton onClick={copy} aria-label="Copy the source id for the CLI">
            <Text size="xs" c="dimmed" {...stylex.props(styles.id)}>
              {copied ? "Copied" : shortIdOf(source.id)}
            </Text>
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

/** The conclusions that cite these words, each with whether it cites them as support or as contradiction. */
function SourceLedTo({ cited }: { cited: ReadonlyArray<Citation> }) {
  const catalog = useReviewCatalog();
  return (
    <Stack gap="xs">
      <Group gap="xxs">
        <Text size="md" fw={600}>
          Led to
        </Text>
        <Text size="md" c="gray.7">
          {cited.length}
        </Text>
      </Group>
      {cited.length === 0 ? (
        <Text size="sm" c="gray.7">
          No conclusions cite these words yet. Your agent proposes from saved words when you catch up with
          /tastebud:review, and anything it proposes lands in your inbox.
        </Text>
      ) : (
        <Paper px="md" py="sm">
          <Stack gap="sm">
            {cited.map((citation) => (
              <Group key={citation.id} gap="sm" wrap="nowrap" align="baseline">
                <Text
                  size="sm"
                  fw={600}
                  c={citation.role === "contradicts" ? "red.8" : "teal.8"}
                  {...stylex.props(styles.citationRole)}
                >
                  {CITATION_ROLE_WORDS[citation.role]}
                </Text>
                <DerivationSummaryLine catalog={catalog} summary={citation} />
              </Group>
            ))}
          </Stack>
        </Paper>
      )}
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
        title={`${source.said_by_label}, ${formatReviewDate(source.said_at)}`}
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
    </Stack>
  );
}
