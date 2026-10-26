import {
  Box,
  Alert,
  Anchor,
  Center,
  CopyButton,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { shortIdOf } from "@taste/core/taste-vocabulary";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { recordDetailQuery, useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { formatReviewTime } from "#review/shared/format.ts";
import { DerivationSummaryLine } from "#review/shared/ui/derivation-link.tsx";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { PlaceChip } from "#review/shared/ui/place-chips.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

const Route = getRouteApi("/sources/$id");

const styles = stylex.create({
  screen: { maxWidth: "820px" },
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
    <Stack gap="md" {...stylex.props(styles.screen)}>
      <Group justify="space-between">
        <AnchorLink to="/sources" size="sm" c="dimmed" underline="hover">
          <Group gap="2xs">
            <ArrowLeft size={14} />
            Sources
          </Group>
        </AnchorLink>
        <CopyButton value={source.id}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? "Copied" : "Copy the id for the CLI"} withArrow>
              <Text c="dimmed" fz="2xs" onClick={copy} {...stylex.props(styles.id)}>
                {shortIdOf(source.id)}
              </Text>
            </Tooltip>
          )}
        </CopyButton>
      </Group>

      <Stack gap="xs">
        <Text size="sm" c="dimmed">
          {capitalize(view.kindLabel)}
          {view.retired && " (retired kind)"} · {source.said_by_label}, {formatReviewTime(source.said_at)}
        </Text>
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
      </Stack>

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
              <Tooltip label="Where the capture happened. Provenance only: it never scopes anything." withArrow>
                <Text size="xs" c="dimmed">
                  Captured in
                </Text>
              </Tooltip>
              <Group gap="2xs">
                {source.captured_in.map((place) => (
                  <PlaceChip key={place} place={place} label={known.labelOf(place)} />
                ))}
              </Group>
            </>
          )}
          {source.address !== undefined && (
            <>
              <Text size="xs" c="dimmed">
                Where
              </Text>
              <Anchor href={source.address} target="_blank" rel="noreferrer" size="sm">
                <Group gap="2xs" wrap="nowrap">
                  {source.address}
                  <ExternalLink size={12} />
                </Group>
              </Anchor>
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
          {detail.data.revisedBy.length > 0 && (
            <>
              <Text size="xs" c="dimmed">
                Revised by
              </Text>
              <Stack gap="3xs">
                {detail.data.revisedBy.map((later) => (
                  <AnchorLink key={later.id} to="/sources/$id" params={{ id: later.id }} size="sm" lineClamp={1}>
                    “{later.quote}”
                  </AnchorLink>
                ))}
              </Stack>
            </>
          )}
        </Box>
      </Paper>

      <Stack gap="xxs">
        <Group gap="xxs">
          <Text size="sm" fw={600}>
            Cited by
          </Text>
          <Text size="xs" c="dimmed">
            {cited.length}
          </Text>
        </Group>
        {cited.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nothing cites these words yet.
          </Text>
        ) : (
          <Paper px="md" py="sm">
            <Stack gap="xxs">
              {cited.map((summary) => (
                <DerivationSummaryLine catalog={catalog} key={summary.id} summary={summary} />
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>
    </Stack>
  );
}
