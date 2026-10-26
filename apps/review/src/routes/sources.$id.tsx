import { Alert, Anchor, Center, CopyButton, Group, Loader, Paper, Stack, Text, Title, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { shortIdOf } from "@taste/core/vocabulary";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { DerivationSummaryLine } from "../ui/derivation-link.tsx";
import { formatReviewTime } from "../ui/format.ts";
import { capitalize } from "../ui/kind-identity.tsx";
import { PlaceChip } from "../ui/place-chips.tsx";
import { recordDetailQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { AnchorLink } from "../ui/router-links.tsx";
import { useKnownPlaces } from "../ui/use-review-context.ts";

export const Route = createFileRoute("/sources/$id")({ component: SourceScreen });

const styles = stylex.create({
  screen: { maxWidth: "820px" },
  quote: { fontSize: "19px", lineHeight: 1.45, fontWeight: 500, whiteSpace: "pre-wrap", textWrap: "pretty" },
  around: { whiteSpace: "pre-wrap" },
  facts: {
    display: "grid",
    gridTemplateColumns: "96px minmax(0, 1fr)",
    columnGap: "12px",
    rowGap: "6px",
    alignItems: "baseline",
  },
  id: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: "11px", cursor: "copy" },
});

function SourceScreen() {
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
          <Group gap={4}>
            <ArrowLeft size={14} />
            Sources
          </Group>
        </AnchorLink>
        <CopyButton value={source.id}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? "Copied" : "Copy the id for the CLI"} withArrow>
              <Text c="dimmed" onClick={copy} {...stylex.props(styles.id)}>
                {shortIdOf(source.id)}
              </Text>
            </Tooltip>
          )}
        </CopyButton>
      </Group>

      <Stack gap={8}>
        <Text size="sm" c="dimmed">
          {capitalize(view.kindLabel)}
          {view.retired && " (retired kind)"} · {source.said_by_label}, {formatReviewTime(source.said_at)}
        </Text>
        {source.before !== undefined && (
          <Text size="sm" c="dimmed" {...stylex.props(styles.around)}>
            …{source.before}
          </Text>
        )}
        <Title order={2} {...stylex.props(styles.quote)}>
          “{source.quote}”
        </Title>
        {source.after !== undefined && (
          <Text size="sm" c="dimmed" {...stylex.props(styles.around)}>
            {source.after}…
          </Text>
        )}
      </Stack>

      <Paper px="md" py="sm">
        <div {...stylex.props(styles.facts)}>
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
              <Group gap={4}>
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
                <Group gap={4} wrap="nowrap">
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
              <Stack gap={2}>
                {detail.data.revisedBy.map((later) => (
                  <AnchorLink key={later.id} to="/sources/$id" params={{ id: later.id }} size="sm" lineClamp={1}>
                    “{later.quote}”
                  </AnchorLink>
                ))}
              </Stack>
            </>
          )}
        </div>
      </Paper>

      <Stack gap={6}>
        <Group gap={6}>
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
            <Stack gap={6}>
              {cited.map((summary) => (
                <DerivationSummaryLine key={summary.id} summary={summary} />
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>
    </Stack>
  );
}
