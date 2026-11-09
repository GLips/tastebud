import { Box, Alert, Center, Loader, Stack } from "@mantine/core";
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

import { DerivationActivity } from "./derivation-activity.tsx";
import { DerivationBackLink, DerivationRestsOn, DerivationTitleRow, useDerivationBack } from "./derivation-header.tsx";
import { DerivationProperties } from "./derivation-properties.tsx";
import { DerivationRelated, versionsOf } from "./derivation-related.tsx";
import { DerivationReviewPanels, DerivationScopeProperty, useDerivationPageHotkeys } from "./derivation-review.tsx";
import { DerivationRail } from "./derivation-status.tsx";
import { useDerivationReview } from "./use-derivation-review.ts";

const Route = getRouteApi("/derivations/$id");

/** The hash a link to discuss a derivation carries: `{ to: "/derivations/$id", hash: "thread" }`. */
const DERIVATION_THREAD_HASH = "thread";

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) 330px",
      "@media (max-width: 900px)": "minmax(0, 1fr)",
    },
    columnGap: "32px",
    rowGap: "20px",
    alignItems: "start",
  },
  properties: { position: "sticky", top: "16px" },
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

/** An issue-like page: the title, evidence, relations and activity in the main column; the state card and properties beside. */
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
  // Discuss links (the inbox's D) arrive at #thread: the composer takes focus, not the primary action.
  const discussing = useLocation({ select: (location) => location.hash === DERIVATION_THREAD_HASH });
  useDerivationPageHotkeys(review, back.go);

  return (
    <Stack gap="md">
      <DerivationBackLink view={view} kind={kind} back={back} />
      <Box {...stylex.props(styles.layout)}>
        <Stack gap="xl">
          <Stack gap="md">
            <DerivationTitleRow size="page" statement={view.statement} />
            <DerivationReviewPanels
              review={review}
              acceptLabel={acceptLabel}
              known={known}
              versions={versionsOf(view, detail.despitedBy)}
            />
          </Stack>
          <DerivationRestsOn view={view} kind={kind} owner={owner} />
          <DerivationRelated view={view} backlinks={detail} known={known} />
          <DerivationActivity
            id={DERIVATION_THREAD_HASH}
            view={view}
            owner={owner}
            known={known}
            listeners={detail.listeners}
            focusComposer={discussing}
          />
        </Stack>
        <Box {...stylex.props(styles.properties)}>
          <DerivationRail
            review={review}
            acceptLabel={acceptLabel}
            owner={owner}
            properties={
              <DerivationProperties
                view={view}
                kind={kind}
                owner={owner}
                scope={<DerivationScopeProperty review={review} known={known} />}
              />
            }
          />
        </Box>
      </Box>
    </Stack>
  );
}
