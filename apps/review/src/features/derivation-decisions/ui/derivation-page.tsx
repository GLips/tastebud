import { Box, Alert, Center, Group, Loader, Paper, Stack } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { scopePlacesOf } from "@tastebud/core/places";
import type { DerivationView, ShowResult } from "@tastebud/core/record-views";
import type { ListenerHeartbeat } from "@tastebud/core/review-threads";

import { recordDetailQuery, useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { findKindView } from "#review/shared/ui/kind-identity.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink, ButtonLink } from "#review/shared/ui/router-links.tsx";

import { DerivationEvidence, DerivationHeader, DerivationScopeFacts } from "./derivation-header.tsx";
import { DerivationActions, DerivationReviewPanels, useDerivationReview } from "./derivation-review.tsx";
import { DerivationSidebar, hasDerivationSidebar } from "./derivation-sidebar.tsx";
import { DerivationThread } from "./derivation-thread.tsx";

const Route = getRouteApi("/derivations/$id");

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) 300px",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    gap: "20px",
    alignItems: "start",
  },
  single: { gridTemplateColumns: "minmax(0, 1fr)" },
});

export function DerivationPage() {
  const { id } = Route.useParams();
  const detail = useQuery(recordDetailQuery(id));
  const view = detail.data?.derivation;

  if (detail.error) return <QueryErrorAlert error={detail.error} />;
  if (detail.data === undefined) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }
  if (view === undefined) {
    return (
      <Alert color="gray" title="Not a derivation">
        This record is a {detail.data.record.type}.{" "}
        {detail.data.record.type === "Source" && (
          <AnchorLink to="/sources/$id" params={{ id: detail.data.record.id }}>
            Open it as a source
          </AnchorLink>
        )}
      </Alert>
    );
  }
  // Keyed by id so a link to another revision starts with a fresh draft and mode.
  return <DerivationDetail key={view.id} view={view} detail={detail.data} />;
}

function DerivationDetail({
  view,
  detail,
}: {
  view: DerivationView;
  detail: ShowResult & { readonly listeners: ReadonlyArray<ListenerHeartbeat> };
}) {
  const catalog = useReviewCatalog();
  const known = useKnownPlaces([...scopePlacesOf(view.proposedScope), ...scopePlacesOf(view.effectiveScope)]);
  const review = useDerivationReview(view);
  const owner = catalog?.owner ?? "";
  const kind = findKindView(catalog, view.kind);
  const acceptLabel = kind?.acceptLabel ?? "Accept";
  const hasSidebar = hasDerivationSidebar(view, detail);

  return (
    <Stack gap="md">
      <DerivationHeader
        view={view}
        kind={kind}
        catalog={catalog}
        owner={owner}
        actions={<DerivationActions review={review} acceptLabel={acceptLabel} known={known} />}
      />
      <DerivationScopeFacts view={view} known={known} />
      <DerivationReviewPanels review={review} acceptLabel={acceptLabel} known={known} />

      <Box {...stylex.props(styles.layout, !hasSidebar && styles.single)}>
        <Stack gap="md">
          <DerivationEvidence view={view} kind={kind} />
          <Paper p="md">
            <DerivationThread derivationId={view.id} thread={view.thread} owner={owner} listeners={detail.listeners} />
          </Paper>
        </Stack>
        {hasSidebar && <DerivationSidebar view={view} detail={detail} owner={owner} known={known} />}
      </Box>
      {view.status === "pending" && (
        <Group>
          <ButtonLink to="/" search={{ kind: view.kind }} variant="subtle" color="gray" size="xs">
            Back to the inbox
          </ButtonLink>
        </Group>
      )}
    </Stack>
  );
}
