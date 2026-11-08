import {
  Alert,
  Box,
  Center,
  CopyButton,
  Grid,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import type { Citation, SourceView } from "@tastebud/core/record-views";
import type { SourceRecord } from "@tastebud/core/records";
import { shortIdOf } from "@tastebud/core/taste-vocabulary";
import { ArrowLeft } from "lucide-react";

import { recordDetailQuery, useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatReviewTime } from "#review/shared/format.ts";
import { DerivationSummaryLine } from "#review/shared/ui/derivation-link.tsx";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { ReviewPageHeader } from "#review/shared/ui/page-header.tsx";
import { PlaceChip } from "#review/shared/ui/place-chips.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SourceAddress } from "#review/shared/ui/source-address.tsx";

const Route = getRouteApi("/sources/$id");

const styles = stylex.create({
  citationRole: { width: "76px", flexShrink: 0 },
  quote: { lineHeight: 1.45, fontWeight: 500, whiteSpace: "pre-wrap", textWrap: "pretty" },
  around: { whiteSpace: "pre-wrap" },
  facts: {
    display: "grid",
    gridTemplateColumns: "96px minmax(0, 1fr)",
    columnGap: "12px",
    rowGap: "6px",
    alignItems: "baseline",
  },
  id: { fontFamily: "var(--mantine-font-family-monospace)", cursor: "copy" },
});

const CITATION_ROLE_WORDS: Record<Citation["role"], string> = {
  supports: "Supports",
  contradicts: "Contradicts",
};

/** Who said it, how it was captured, where, and how it relates to earlier and later words. */
function SourceFacts({
  view,
  revisedBy,
  labelOf,
}: {
  view: SourceView;
  revisedBy: ReadonlyArray<SourceRecord>;
  labelOf: (place: string) => string;
}) {
  const { source } = view;
  return (
    <Paper px="md" py="sm">
      <Box {...stylex.props(styles.facts)}>
        <Text size="xs" c="dimmed">
          Said by
        </Text>
        <Text size="sm">
          {source.said_by_label}{" "}
          <Text span size="xs" c="dimmed">
            {source.said_by}
          </Text>
        </Text>
        <Text size="xs" c="dimmed">
          Captured
        </Text>
        <Text size="sm">
          {formatReviewTime(source.captured_at)} by {source.captured_via}
        </Text>
        {source.captured_in !== undefined && source.captured_in.length > 0 && (
          <>
            <Text size="xs" c="dimmed">
              Captured in
            </Text>
            <Stack gap="3xs">
              <Group gap="2xs">
                {source.captured_in.map((place) => (
                  <PlaceChip key={place} place={place} label={labelOf(place)} />
                ))}
              </Group>
              <Text size="xs" c="dimmed">
                Where the capture happened. Provenance only: it never decides where anything applies.
              </Text>
            </Stack>
          </>
        )}
        {source.address !== undefined && (
          <>
            <Text size="xs" c="dimmed">
              Where
            </Text>
            <SourceAddress address={source.address} variant="line" />
          </>
        )}
        {source.revises !== undefined && (
          <>
            <Text size="xs" c="dimmed">
              Revises
            </Text>
            <AnchorLink to="/sources/$id" params={{ id: source.revises }} size="sm">
              An earlier {view.kindLabel}
            </AnchorLink>
          </>
        )}
        {revisedBy.length > 0 && (
          <>
            <Text size="xs" c="dimmed">
              Revised by
            </Text>
            <Stack gap="3xs">
              {revisedBy.map((later) => (
                <AnchorLink key={later.id} to="/sources/$id" params={{ id: later.id }} size="sm" lineClamp={1}>
                  “{later.quote}”
                </AnchorLink>
              ))}
            </Stack>
          </>
        )}
      </Box>
    </Paper>
  );
}

export function SourcePage() {
  const catalog = useReviewCatalog();
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
  const cited = detail.data.citedBy;

  return (
    <Stack gap="lg">
      <ReviewPageHeader
        crumb={
          <AnchorLink to="/sources" size="sm" c="dimmed" underline="hover" aria-label="Back to all sources">
            <Group gap="2xs">
              <ArrowLeft size={14} aria-hidden />
              Sources
            </Group>
          </AnchorLink>
        }
        title={`${capitalize(view.kindLabel)}${view.retired ? " (retired kind)" : ""}`}
        purpose={`${source.said_by_label}'s exact words, and the conclusions your agents drew from them.`}
        actions={
          <CopyButton value={source.id}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? "Copied" : "Copy the id for the CLI"} withArrow>
                <UnstyledButton onClick={copy} aria-label="Copy the source id">
                  <Text c="dimmed" fz="2xs" {...stylex.props(styles.id)}>
                    {shortIdOf(source.id)}
                  </Text>
                </UnstyledButton>
              </Tooltip>
            )}
          </CopyButton>
        }
      />

      <Grid gap="xl">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack gap="md">
            <Stack gap="xs">
              {source.before !== undefined && (
                <Text size="sm" c="dimmed" {...stylex.props(styles.around)}>
                  …{source.before}
                </Text>
              )}
              <Title order={2} fz="sourceQuote" {...stylex.props(styles.quote)}>
                “{source.quote}”
              </Title>
              {source.after !== undefined && (
                <Text size="sm" c="dimmed" {...stylex.props(styles.around)}>
                  {source.after}…
                </Text>
              )}
              <Text size="sm" c="dimmed">
                — {source.said_by_label}, {formatReviewTime(source.said_at)}
              </Text>
            </Stack>
            <SourceFacts view={view} revisedBy={detail.data.revisedBy} labelOf={known.labelOf} />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="xs">
            <Group gap="xxs">
              <Text size="sm" fw={600}>
                Cited by
              </Text>
              <Text size="sm" c="dimmed">
                {cited.length}
              </Text>
            </Group>
            {cited.length === 0 ? (
              <Text size="sm" c="dimmed">
                No conclusions cite these words yet. Your agent proposes from saved words when you catch up with
                /tastebud:review, and anything it proposes lands in your inbox.
              </Text>
            ) : (
              <Paper px="md" py="sm">
                <Stack gap="sm">
                  {cited.map((citation) => (
                    <Group key={citation.id} gap="sm" wrap="nowrap" align="baseline">
                      <Text
                        size="xs"
                        fw={600}
                        c={citation.role === "contradicts" ? "red.7" : "teal.8"}
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
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
