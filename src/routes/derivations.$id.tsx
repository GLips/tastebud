import { Alert, Center, Group, Loader, Paper, Stack } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import type { DerivationView, ListenerHeartbeat, ShowResult } from "../core/index.ts";
import { scopePlacesOf } from "../shared/places.ts";
import { DerivationEvidence, DerivationHeader, DerivationScopeFacts } from "../ui/derivation-header.tsx";
import { DerivationActions, DerivationReviewPanels, useDerivationReview } from "../ui/derivation-review.tsx";
import { DerivationSidebar, hasDerivationSidebar } from "../ui/derivation-sidebar.tsx";
import { DerivationThread } from "../ui/derivation-thread.tsx";
import { findKindView } from "../ui/kind-identity.tsx";
import { recordDetailQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { AnchorLink, ButtonLink } from "../ui/router-links.tsx";
import { useKnownPlaces, useReviewCatalog } from "../ui/use-review-context.ts";

export const Route = createFileRoute("/derivations/$id")({ component: DerivationScreen });

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

function DerivationScreen() {
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
        actions={<DerivationActions review={review} acceptLabel={acceptLabel} />}
      />
      <DerivationScopeFacts view={view} known={known} />
      <DerivationReviewPanels review={review} acceptLabel={acceptLabel} known={known} />

      <div {...stylex.props(styles.layout, !hasSidebar && styles.single)}>
        <Stack gap="md">
          <DerivationEvidence view={view} kind={kind} />
          <Paper p="md">
            <DerivationThread derivationId={view.id} thread={view.thread} owner={owner} listeners={detail.listeners} />
          </Paper>
        </Stack>
        {hasSidebar && <DerivationSidebar view={view} detail={detail} owner={owner} known={known} />}
      </div>
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
