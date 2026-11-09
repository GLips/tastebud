/**
 * Places' "Test a path": which place one folder (or named place) resolves to, opened above the place it
 * lands on, and the paths you keep checking, which the audit warns about when none reach a place.
 * The kept paths live in this browser.
 */
import { ActionIcon, Badge, Box, Button, Group, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuditPlacesResult } from "@tastebud/core/places-audit";
import type { PlaceResolverName } from "@tastebud/core/taste-vocabulary";
import { ArrowRight, LocateFixed, Pin, X } from "lucide-react";
import { Fragment, useState } from "react";

import {
  reviewContextQuery,
  reviewShellQuery,
  useKnownPlaces,
  useReviewCatalog,
} from "#review/features/review-shell/index.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { ReviewQueryError } from "#review/shared/review-outcome.ts";
import { capitalize } from "#review/shared/ui/kind-identity.tsx";
import { PlaceChip } from "#review/shared/ui/place-chips.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

const styles = stylex.create({
  panel: {
    paddingBottom: "16px",
    marginBottom: "16px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--mantine-color-gray-2)",
  },
  grow: { flex: 1 },
  pathRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.9fr) 16px minmax(0, 1.1fr) auto",
    columnGap: "8px",
    alignItems: "center",
    paddingBlock: "4px",
  },
  mono: { fontFamily: "var(--mantine-font-family-monospace)" },
});

// The store's setting, said as one, so it never reads as the result of the path just tested.
const PLACE_RESOLVER_SETTINGS: Record<PlaceResolverName, string> = {
  git: "This store matches places by git repo",
  directories: "This store matches places by folder",
  custom: "This store matches places by its own rule",
};

const PLACE_RESOLVER_DESCRIPTIONS: Record<PlaceResolverName, string> = {
  git: "Inside a git checkout, its repo (and subfolder); anywhere else, the folder itself",
  directories: "The folder itself",
  custom: "A rule in tastebud.config.ts decides",
};

/** A path in monospace that wraps only after a slash, never mid-name. */
function PathText({ path }: { path: string }) {
  return (
    <Text fz="xs" {...stylex.props(styles.mono)}>
      {path.split("/").map((part, index) => (
        // Parts repeat ("a/a"), so the index is the only stable key.
        // oxlint-disable-next-line react/no-array-index-key
        <Fragment key={index}>
          {index > 0 && "/"}
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </Text>
  );
}

/** The places a path resolved to, or a quiet "no place" when the resolver returned none. */
function ResolvedPlaces({ places, known }: { places: ReadonlyArray<string> | undefined; known: KnownPlaces }) {
  if (places === undefined) return <SupportingText tier="faint">…</SupportingText>;
  if (places.length === 0) return <Badge color="orange">No place</Badge>;
  return places.map((place) => <PlaceChip key={place} place={place} label={known.labelOf(place)} />);
}

/** Why a path failed to resolve, without the path the row already shows: core's problem, else its sentence. */
const pathTestProblemOf = (error: Error): string =>
  capitalize(error instanceof ReviewQueryError ? (error.failure.problems?.[0] ?? error.message) : error.message);

/** One tested path: where it lands, or why it lands nowhere, and Keep for a path not yet kept. */
function PathTestResult({
  path,
  resolved,
  known,
  keep,
}: {
  path: string;
  resolved: { readonly data?: { readonly places: ReadonlyArray<string> } | undefined; readonly error: Error | null };
  known: KnownPlaces;
  /** Undefined when the path is the placeholder's or already kept. */
  keep: (() => void) | undefined;
}) {
  return (
    <Box {...stylex.props(styles.pathRow)}>
      <PathText path={path} />
      <ArrowRight size={12} color="var(--mantine-color-gray-5)" />
      {resolved.error ? (
        <SupportingText tier="secondary">{pathTestProblemOf(resolved.error)}</SupportingText>
      ) : (
        <Group gap="2xs">
          <ResolvedPlaces places={resolved.data?.places} known={known} />
        </Group>
      )}
      {keep === undefined || resolved.error ? (
        <Box />
      ) : (
        <Tooltip label="Warn me if a place stops being reached" withArrow>
          <Button variant="subtle" size="xs" leftSection={<Pin size={12} />} onClick={keep}>
            Keep
          </Button>
        </Tooltip>
      )}
    </Box>
  );
}

/**
 * Of the places a path resolves to, the one the details pane opens: the most specific with items, else the
 * most specific, so a path that lands nowhere in use still shows that nothing applies there.
 */
const placeToOpenOf = (places: ReadonlyArray<string>, audit: AuditPlacesResult | undefined) => {
  const specificFirst = places.toSorted((left, right) => right.length - left.length);
  return specificFirst.find((place) => audit?.places.some((entry) => entry.place === place)) ?? specificFirst[0];
};

export function PlacePathTester({
  probes,
  addProbe,
  setProbes,
  audit,
  known,
  onOpenPlace,
  onClose,
}: {
  probes: ReadonlyArray<string>;
  addProbe: (probe: string) => void;
  setProbes: (probes: ReadonlyArray<string>) => void;
  audit: AuditPlacesResult | undefined;
  known: KnownPlaces;
  onOpenPlace: (place: string) => void;
  onClose: () => void;
}) {
  const catalog = useReviewCatalog();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [emptySubmit, setEmptySubmit] = useState(false);
  const [asked, setAsked] = useState<string | undefined>(undefined);
  // The store's folder always exists, so the placeholder resolves; until a path is typed the bench shows it
  // resolved, so it opens on a result rather than an empty field.
  const storeRoot = useQuery(reviewShellQuery).data?.storeRoot;
  const shown = asked ?? storeRoot;
  const resolved = useQuery({ ...reviewContextQuery({ in: shown }), enabled: shown !== undefined });
  const resolvedKnown = useKnownPlaces(resolved.data?.places ?? []);
  const unreached = probes.length === 0 ? 0 : (audit?.audit.unmatched.length ?? 0);

  const test = (path: string) => {
    setAsked(path);
    // A path that resolves nowhere is shown by `resolved`'s error, so the fetch's own rejection is dropped.
    void queryClient
      .fetchQuery(reviewContextQuery({ in: path }))
      .then(
        (context) => placeToOpenOf(context.places, audit),
        () => undefined,
      )
      .then((place) => place !== undefined && onOpenPlace(place));
  };

  return (
    <Stack gap="sm" {...stylex.props(styles.panel)}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs">
          <Text fw={600}>Test a path</Text>
          {catalog !== undefined && (
            <Tooltip label={PLACE_RESOLVER_DESCRIPTIONS[catalog.resolver]} withArrow multiline maw={300}>
              <SupportingText tier="secondary" w="fit-content">
                {PLACE_RESOLVER_SETTINGS[catalog.resolver]}
              </SupportingText>
            </Tooltip>
          )}
        </Group>
        <Tooltip label="Close" withArrow>
          <ActionIcon variant="subtle" color="gray" aria-label="Close Test a path" onClick={onClose}>
            <X size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() === "") setEmptySubmit(true);
          else test(draft.trim());
        }}
      >
        <Group gap="xs" wrap="nowrap">
          <TextInput
            aria-label="A folder or place to test"
            placeholder={storeRoot ?? "A folder"}
            leftSection={<LocateFixed size={14} />}
            value={draft}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              setEmptySubmit(false);
            }}
            autoFocus
            {...stylex.props(styles.grow)}
          />
          <Button variant="default" type="submit" loading={resolved.isFetching}>
            Test
          </Button>
        </Group>
      </form>
      {/* An empty Enter replaces the last result with the hint, so nothing stale reads as its answer. */}
      {emptySubmit ? (
        <SupportingText tier="secondary">Type a folder path to test</SupportingText>
      ) : (
        shown !== undefined && (
          <PathTestResult
            path={shown}
            resolved={resolved}
            known={resolvedKnown}
            keep={asked === undefined || probes.includes(asked) ? undefined : () => addProbe(asked)}
          />
        )
      )}
      {probes.length > 0 && (
        <Stack gap="3xs">
          <Group gap="xs">
            <Text size="sm" fw={600}>
              Kept paths
            </Text>
            {audit !== undefined && (
              <Badge color={unreached > 0 ? "orange" : "tastebud"}>
                {unreached > 0 ? `${unreached} ${unreached === 1 ? "place" : "places"} unreached` : "All reached"}
              </Badge>
            )}
          </Group>
          {probes.map((probe) => (
            <Box key={probe} {...stylex.props(styles.pathRow)}>
              <PathText path={probe} />
              <ArrowRight size={12} color="var(--mantine-color-gray-5)" />
              <Group gap="2xs">
                <ResolvedPlaces
                  places={
                    audit?.audit.probes.find((entry) => entry.probe === probe || entry.places.includes(probe))?.places
                  }
                  known={known}
                />
              </Group>
              <Tooltip label="Stop checking this" withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label={`Remove ${probe}`}
                  onClick={() => setProbes(probes.filter((kept) => kept !== probe))}
                >
                  <X size={13} />
                </ActionIcon>
              </Tooltip>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
