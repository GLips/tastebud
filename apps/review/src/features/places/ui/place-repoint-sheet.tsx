/**
 * Repoint: swap one place for another in every accepted scope that names it exactly. It only
 * proposes revisions; nothing changes until each is accepted in the inbox.
 */
import { Alert, Anchor, Button, Drawer, Group, Loader, Stack, Text, TextInput } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canonicalPlaceKey, type PlaceKey } from "@tastebud/core/places";
import { Result } from "effect";
import { FolderSearch } from "lucide-react";
import { useState } from "react";

import { reviewContextQuery, useReviewCatalog } from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { STORE_WRITE_STALES } from "#review/shared/query-keys.ts";
import { refreshReviewQueriesAfterWrite } from "#review/shared/refresh-after-write.ts";
import { unwrapReviewOutcome } from "#review/shared/review-outcome.ts";
import { DerivationSummaryLine } from "#review/shared/ui/derivation-link.tsx";
import { KnownPlaceSearch } from "#review/shared/ui/known-place-search.tsx";
import { LoadedQueryContent } from "#review/shared/ui/loaded-query-content.tsx";
import { PlaceChip, PlaceKeyCopy } from "#review/shared/ui/place-chips.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

import { repointReviewPlace } from "../controllers/repoint.ts";
import { repointPreviewQuery } from "./places-queries.ts";

const styles = stylex.create({
  grow: { flex: 1 },
  preWrap: { whiteSpace: "pre-wrap" },
});

const pendingAtFromTitle = (count: number) =>
  count === 1 ? "1 pending proposal still points here" : `${count} pending proposals still point here`;

/**
 * "Resolve a directory": one way to find a key, by running the configured resolver on a working
 * directory, the same lookup as "Where am I?". Named places have no directory, so the To search
 * stays the main way in. Each resulting key is shown in full and only becomes the target when chosen.
 */
function DirectoryPlaceResolver({ onUse, known }: { onUse: (place: PlaceKey) => void; known: KnownPlaces }) {
  const resolver = useReviewCatalog()?.resolver ?? "configured";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string | undefined>(undefined);
  const resolved = useQuery(reviewContextQuery({ in: asked }));
  if (!open)
    return (
      <Anchor component="button" type="button" size="xs" c="dimmed" w="fit-content" onClick={() => setOpen(true)}>
        <Group gap="2xs">
          <FolderSearch size={12} />
          Or resolve a working directory through the {resolver} resolver
        </Group>
      </Anchor>
    );
  return (
    <Stack gap="xxs" pt="2xs">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() !== "") setAsked(draft.trim());
        }}
      >
        <Group gap="xxs" wrap="nowrap">
          <TextInput
            size="xs"
            autoFocus
            aria-label="A working directory to resolve"
            placeholder="A working directory, e.g. ~/code/acme-admin"
            leftSection={<FolderSearch size={13} />}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            {...stylex.props(styles.grow)}
          />
          <Button
            size="xs"
            variant="default"
            type="submit"
            loading={resolved.isFetching}
            disabled={draft.trim() === ""}
          >
            Resolve
          </Button>
          <Button size="xs" variant="subtle" color="gray" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </Group>
      </form>
      {asked !== undefined && resolved.error && (
        <Text size="xs" c="red.7" {...stylex.props(styles.preWrap)}>
          {resolved.error.message}
        </Text>
      )}
      {asked !== undefined && resolved.data !== undefined && resolved.data.places.length === 0 && (
        <Text size="xs" c="dimmed">
          Unknown context: the resolver returned no places for this directory.
        </Text>
      )}
      {asked !== undefined &&
        resolved.data?.places.map((place) => (
          <Group key={place} gap="xs" wrap="nowrap">
            <PlaceChip place={place} label={known.labelOf(place)} linked={false} />
            <PlaceKeyCopy place={place} />
            <Button
              size="compact-xs"
              variant="light"
              ml="auto"
              onClick={() => {
                onUse(place);
                setOpen(false);
              }}
            >
              Use this place
            </Button>
          </Group>
        ))}
    </Stack>
  );
}

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
  const catalog = useReviewCatalog();
  const queryClient = useQueryClient();
  const [to, setTo] = useState("");
  const canonical = to.trim() === "" ? undefined : canonicalPlaceKey(to.trim());
  const target = canonical !== undefined && Result.isSuccess(canonical) ? canonical.success : undefined;
  const repoint = useMutation({
    mutationFn: async (next: PlaceKey) => unwrapReviewOutcome(await repointReviewPlace({ data: { from, to: next } })),
    onSettled: () => refreshReviewQueriesAfterWrite(queryClient, STORE_WRITE_STALES),
  });
  const chooseTo = (next: string) => {
    setTo(next);
    repoint.reset();
  };
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
        <Stack gap="2xs">
          <Text size="xs" c="dimmed">
            From
          </Text>
          <Group gap="xs">
            <PlaceChip place={from} label={known.labelOf(from)} strike={target !== undefined} linked={false} />
            <PlaceKeyCopy place={from} />
          </Group>
        </Stack>
        <Stack gap="2xs">
          <Text size="xs" c="dimmed">
            To
          </Text>
          <KnownPlaceSearch
            known={known}
            options={known.places.filter((place) => place !== from)}
            aria-label="The new place"
            placeholder="Search places, or type any key: a repo, a directory, or a name like clients/acme"
            value={to}
            onChange={chooseTo}
            onPick={chooseTo}
            error={canonical !== undefined && Result.isFailure(canonical) ? canonical.failure : undefined}
          />
          {target !== undefined && (
            <Group gap="xs">
              <PlaceChip place={target} label={known.labelOf(target)} color="tastebud" linked={false} />
              <PlaceKeyCopy place={target} />
            </Group>
          )}
          <DirectoryPlaceResolver onUse={chooseTo} known={known} />
        </Stack>
        {result === undefined && (
          <Stack gap="xxs">
            {target === undefined || target === from ? (
              <Text size="sm" c="dimmed">
                Choose the new place to see what would be proposed.
              </Text>
            ) : (
              <LoadedQueryContent query={preview} loading={<Loader size="xs" />}>
                {(previewed) => (
                  <>
                    <Text size="sm" fw={600}>
                      {revisions.length === 0
                        ? "Nothing would get a revision"
                        : `${revisions.length} accepted ${revisions.length === 1 ? "item" : "items"} would get a revision`}
                    </Text>
                    {revisions.map((revision) => (
                      <Stack key={revision.supersedes.id} gap="3xs">
                        <DerivationSummaryLine catalog={catalog} summary={revision.supersedes} />
                        {revision.keptPlaces.length > 0 && (
                          <Group gap="2xs" pl={18}>
                            <Text size="xs" c="dimmed">
                              Keeps
                            </Text>
                            {revision.keptPlaces.map((place) => (
                              <PlaceChip key={place} place={place} label={known.labelOf(place)} linked={false} />
                            ))}
                          </Group>
                        )}
                      </Stack>
                    ))}
                    {previewed.alreadyPending.length > 0 && (
                      <Text size="xs" c="dimmed">
                        {previewed.alreadyPending.length} already{" "}
                        {previewed.alreadyPending.length === 1 ? "has" : "have"} the same revision pending.
                      </Text>
                    )}
                    {previewed.pendingAtFrom.length > 0 && (
                      <Alert color="gray" variant="light" title={pendingAtFromTitle(previewed.pendingAtFrom.length)}>
                        <Stack gap="2xs">
                          <Text size="xs" c="dark.4">
                            Repoint only revises accepted items. Change these where they wait in the inbox.
                          </Text>
                          {previewed.pendingAtFrom.map((pending) => (
                            <AnchorLink
                              key={pending.id}
                              to="/"
                              search={{ kind: pending.kind, card: pending.id }}
                              size="sm"
                              c="inherit"
                              underline="hover"
                            >
                              {pending.statement}
                            </AnchorLink>
                          ))}
                        </Stack>
                      </Alert>
                    )}
                    {previewed.blocked.length > 0 && (
                      <Alert color="orange" variant="light" title="Won't be proposed">
                        <Stack gap="xxs">
                          {previewed.blocked.map((entry) => (
                            <Stack key={entry.derivation.id} gap="3xs">
                              <DerivationSummaryLine catalog={catalog} summary={entry.derivation} />
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
              </LoadedQueryContent>
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
            color="tastebud"
            variant="light"
            title={
              result.proposals.length === 1
                ? "Scope-change proposal created"
                : `${result.proposals.length} scope-change proposals created`
            }
          >
            <Stack gap="2xs">
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
