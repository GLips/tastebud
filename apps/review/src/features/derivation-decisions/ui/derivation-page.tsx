import { Box, Alert, Center, Loader, Paper, Stack } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useLocation } from "@tanstack/react-router";
import { scopePlacesOf } from "@tastebud/core/places";
import type { DerivationView, ShowResult } from "@tastebud/core/record-views";
import type { ListenerHeartbeat } from "@tastebud/core/review-threads";

import { recordDetailQuery, useKnownPlaces, useReviewCatalog } from "#review/features/review-shell/index.ts";
import { findKindView } from "#review/shared/ui/kind-identity.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

import { DerivationEvidence, DerivationHeader, useDerivationBack } from "./derivation-header.tsx";
import { useDerivationPageHotkeys } from "./derivation-review.tsx";
import { DerivationSidebar } from "./derivation-sidebar.tsx";
import { DerivationStatusCard, newerPendingVersionOf } from "./derivation-status.tsx";
import { DerivationThread } from "./derivation-thread.tsx";
import { useDerivationReview } from "./use-derivation-review.ts";

const Route = getRouteApi("/derivations/$id");

/** The hash a link to discuss a derivation carries: `{ to: "/derivations/$id", hash: "thread" }`. */
const DERIVATION_THREAD_HASH = "thread";

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
  const back = useDerivationBack(view.kind);
  const newer = newerPendingVersionOf(view, detail.despitedBy);
  // Discuss links (the inbox's D) arrive at #thread: the composer takes focus, not the primary action.
  const discussing = useLocation({ select: (location) => location.hash === DERIVATION_THREAD_HASH });
  useDerivationPageHotkeys(review, back.go);

  return (
    <Box {...stylex.props(styles.layout)}>
      <Stack gap="md">
        <DerivationHeader view={view} kind={kind} catalog={catalog} owner={owner} back={back} />
        <DerivationStatusCard review={review} kind={kind} acceptLabel={acceptLabel} known={known} newer={newer} />
        <DerivationEvidence view={view} kind={kind} />
        <Paper p="md" id={DERIVATION_THREAD_HASH}>
          <DerivationThread
            derivationId={view.id}
            thread={view.thread}
            owner={owner}
            listeners={detail.listeners}
            focusComposer={discussing}
          />
        </Paper>
      </Stack>
      <DerivationSidebar view={view} kind={kind} detail={detail} owner={owner} known={known} notedByCard={newer?.id} />
    </Box>
  );
}
