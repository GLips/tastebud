/**
 * Repoint: swap one place for another in every accepted scope that names it exactly. It only
 * proposes revisions; nothing changes until each is accepted in the inbox.
 */
import { Alert, Autocomplete, Button, Drawer, Group, Loader, Stack, Text } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Result } from "effect";
import { useState } from "react";

import { repointReviewPlace } from "../../server/review-functions.ts";
import { unwrapReviewOutcome } from "../../server/review-outcome.ts";
import { canonicalPlaceKey, type PlaceKey } from "../../shared/places.ts";
import { DerivationSummaryLine } from "../derivation-link.tsx";
import { PLACE_FORM_NAMES, PlaceChip, PlaceKeyCopy, placeFormOf } from "../place-chips.tsx";
import { repointPreviewQuery } from "../review-queries.ts";
import { QueryErrorAlert } from "../route-panels.tsx";
import { AnchorLink } from "../router-links.tsx";
import type { KnownPlaces } from "../use-review-context.ts";

export function PlaceRepointSheet({
  from,
  opened,
  onClose,
  known,
}: {
  from: PlaceKey;
  opened: boolean;
  onClose: () => void;
  known: KnownPlaces;
}) {
  const queryClient = useQueryClient();
  const [to, setTo] = useState("");
  const canonical = to.trim() === "" ? undefined : canonicalPlaceKey(to.trim());
  const target = canonical !== undefined && Result.isSuccess(canonical) ? canonical.success : undefined;
  const repoint = useMutation({
    mutationFn: async (next: PlaceKey) => unwrapReviewOutcome(await repointReviewPlace({ data: { from, to: next } })),
    onSettled: () => queryClient.invalidateQueries(),
  });
  const result = repoint.data;
  const preview = useQuery({
    ...repointPreviewQuery(from, target ?? ""),
    enabled: opened && target !== undefined && target !== from && result === undefined,
  });
  const revisions = preview.data?.revisions ?? [];
  const kindsTouched = [...new Set((result?.proposals ?? []).map((proposal) => proposal.revision.kind))];
  return (
    <Drawer
      opened={opened}
      onClose={() => {
        onClose();
        repoint.reset();
        setTo("");
      }}
      position="right"
      size={520}
      title={<Text fw={600}>Repoint a place</Text>}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Proposes a revision of each accepted item scoped to exactly this place, with only this place swapped. Nothing
          changes until you accept the revisions in the inbox.
        </Text>
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            From
          </Text>
          <Group gap={8}>
            <PlaceChip place={from} label={known.labelOf(from)} strike={target !== undefined} />
            <PlaceKeyCopy place={from} />
          </Group>
        </Stack>
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            To
          </Text>
          <Autocomplete
            size="xs"
            aria-label="The new place"
            placeholder="e.g. github.com/acme/admin::"
            data={known.places.filter((place) => place !== from)}
            value={to}
            onChange={(next) => {
              setTo(next);
              repoint.reset();
            }}
            error={canonical !== undefined && Result.isFailure(canonical) ? canonical.failure : undefined}
          />
          {target !== undefined && (
            <Group gap={8}>
              <PlaceChip place={target} label={known.labelOf(target)} color="taste" />
              <Text size="xs" c="dimmed">
                {PLACE_FORM_NAMES[placeFormOf(target)]}
              </Text>
            </Group>
          )}
        </Stack>
        {result === undefined && (
          <Stack gap={6}>
            {target === undefined || target === from ? (
              <Text size="sm" c="dimmed">
                Choose the new place to see what would be proposed.
              </Text>
            ) : preview.error ? (
              <QueryErrorAlert error={preview.error} />
            ) : preview.data === undefined ? (
              <Loader size="xs" />
            ) : (
              <>
                <Text size="sm" fw={600}>
                  {revisions.length === 0
                    ? "Nothing would get a revision"
                    : `${revisions.length} accepted ${revisions.length === 1 ? "item" : "items"} would get a revision`}
                </Text>
                {revisions.map((revision) => (
                  <Stack key={revision.supersedes.id} gap={2}>
                    <DerivationSummaryLine summary={revision.supersedes} />
                    {revision.keptPlaces.length > 0 && (
                      <Group gap={4} pl={18}>
                        <Text size="xs" c="dimmed">
                          Keeps
                        </Text>
                        {revision.keptPlaces.map((place) => (
                          <PlaceChip key={place} place={place} label={known.labelOf(place)} />
                        ))}
                      </Group>
                    )}
                  </Stack>
                ))}
                {preview.data.alreadyPending.length > 0 && (
                  <Text size="xs" c="dimmed">
                    {preview.data.alreadyPending.length} already{" "}
                    {preview.data.alreadyPending.length === 1 ? "has" : "have"} the same revision pending.
                  </Text>
                )}
                {preview.data.blocked.length > 0 && (
                  <Alert color="orange" variant="light" title="Won't be proposed">
                    <Stack gap={6}>
                      {preview.data.blocked.map((entry) => (
                        <Stack key={entry.derivation.id} gap={2}>
                          <DerivationSummaryLine summary={entry.derivation} />
                          <Text size="xs" c="dimmed" pl={18}>
                            {entry.problem}
                          </Text>
                        </Stack>
                      ))}
                    </Stack>
                  </Alert>
                )}
              </>
            )}
          </Stack>
        )}
        {repoint.error && (
          <Alert color="red" variant="light">
            {repoint.error.message}
          </Alert>
        )}
        {result !== undefined ? (
          <Alert
            color="taste"
            variant="light"
            title={
              result.proposals.length === 1
                ? "Scope-change proposal created"
                : `${result.proposals.length} scope-change proposals created`
            }
          >
            <Stack gap={4}>
              {result.alreadyPending.length > 0 && (
                <Text size="sm">{result.alreadyPending.length} already had the same revision pending.</Text>
              )}
              {kindsTouched.map((kind) => (
                <AnchorLink key={kind} to="/" search={{ kind }} size="sm">
                  Review the {kind} revisions in the inbox
                </AnchorLink>
              ))}
            </Stack>
          </Alert>
        ) : (
          <Button
            disabled={target === undefined || target === from || revisions.length === 0 || preview.isPlaceholderData}
            loading={repoint.isPending}
            onClick={() => target !== undefined && repoint.mutate(target)}
          >
            Create {revisions.length} scope-change {revisions.length === 1 ? "proposal" : "proposals"}
          </Button>
        )}
      </Stack>
    </Drawer>
  );
}
