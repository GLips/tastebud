/**
 * Repoint: swap one place for another in every accepted scope that names it exactly. It only
 * proposes revisions; nothing changes until each is accepted in the inbox.
 */
import { Alert, Anchor, Button, Drawer, Group, Loader, Stack, Text, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Result } from "effect";
import { FolderSearch } from "lucide-react";
import { useState } from "react";

import { repointReviewPlace } from "../../server/review-functions.ts";
import { unwrapReviewOutcome } from "../../server/review-outcome.ts";
import { canonicalPlaceKey, type PlaceKey } from "../../shared/places.ts";
import { DerivationSummaryLine } from "../derivation-link.tsx";
import { KnownPlaceSearch } from "../known-place-search.tsx";
import { PlaceChip, PlaceKeyCopy } from "../place-chips.tsx";
import { repointPreviewQuery, reviewContextQuery } from "../review-queries.ts";
import { QueryErrorAlert } from "../route-panels.tsx";
import { AnchorLink } from "../router-links.tsx";
import { type KnownPlaces, useReviewCatalog } from "../use-review-context.ts";

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
        <Group gap={4}>
          <FolderSearch size={12} />
          Or resolve a working directory through the {resolver} resolver
        </Group>
      </Anchor>
    );
  return (
    <Stack gap={6} pt={4}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() !== "") setAsked(draft.trim());
        }}
      >
        <Group gap={6} wrap="nowrap">
          <TextInput
            size="xs"
            autoFocus
            aria-label="A working directory to resolve"
            placeholder="A working directory, e.g. ~/code/acme-admin"
            leftSection={<FolderSearch size={13} />}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            style={{ flex: 1 }}
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
        <Text size="xs" c="red.7" style={{ whiteSpace: "pre-wrap" }}>
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
          <Group key={place} gap={8} wrap="nowrap">
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
  const queryClient = useQueryClient();
  const [to, setTo] = useState("");
  const canonical = to.trim() === "" ? undefined : canonicalPlaceKey(to.trim());
  const target = canonical !== undefined && Result.isSuccess(canonical) ? canonical.success : undefined;
  const repoint = useMutation({
    mutationFn: async (next: PlaceKey) => unwrapReviewOutcome(await repointReviewPlace({ data: { from, to: next } })),
    onSettled: () => queryClient.invalidateQueries(),
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
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            From
          </Text>
          <Group gap={8}>
            <PlaceChip place={from} label={known.labelOf(from)} strike={target !== undefined} linked={false} />
            <PlaceKeyCopy place={from} />
          </Group>
        </Stack>
        <Stack gap={4}>
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
            <Group gap={8}>
              <PlaceChip place={target} label={known.labelOf(target)} color="taste" linked={false} />
              <PlaceKeyCopy place={target} />
            </Group>
          )}
          <DirectoryPlaceResolver onUse={chooseTo} known={known} />
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
                          <PlaceChip key={place} place={place} label={known.labelOf(place)} linked={false} />
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
                {preview.data.pendingAtFrom.length > 0 && (
                  <Alert color="gray" variant="light" title={pendingAtFromTitle(preview.data.pendingAtFrom.length)}>
                    <Stack gap={4}>
                      <Text size="xs" c="dark.4">
                        Repoint only revises accepted items. Change these where they wait in the inbox.
                      </Text>
                      {preview.data.pendingAtFrom.map((pending) => (
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
