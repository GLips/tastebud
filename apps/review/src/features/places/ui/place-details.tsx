/** The Places page's right column: one place's counts, what is scoped to it, and whether probes reach it. */
import { Alert, Button, Group, Stack, Table, Text, Title } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { placeCovers, scopePlacesOf } from "@tastebud/core/places";
import type { AuditPlacesResult } from "@tastebud/core/places-audit";
import type { DerivationSummary } from "@tastebud/core/record-views";
import { Globe, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { derivationListQuery } from "#review/features/derivation-library/index.ts";
import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { GLOBAL_PLACE_NODE } from "#review/shared/known-place-labels.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { DerivationSummaryLine } from "#review/shared/ui/derivation-link.tsx";
import { capitalize, KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { PLACE_FORM_NAMES, PlaceFormIcon, placeFormOf, PlaceKeyCopy } from "#review/shared/ui/place-chips.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

import { PlaceRepointSheet } from "./place-repoint-sheet.tsx";

const styles = stylex.create({
  shrinkable: { minWidth: 0 },
  numeric: { fontVariantNumeric: "tabular-nums" },
  onward: { rowGap: "2px" },
});

function CountsTable({ counts }: { counts: AuditPlacesResult["globalCounts"] }) {
  const catalog = useReviewCatalog();
  const kinds = [...new Set(counts.map((entry) => entry.kind))];
  const statuses = ["pending", "accepted", "rejected", "superseded", "retracted"] as const;
  const shown = statuses.filter((status) => counts.some((entry) => entry.status === status));
  if (counts.length === 0)
    return (
      <Text size="sm" c="dimmed">
        Nothing is scoped here.
      </Text>
    );
  return (
    <Table withRowBorders={false} verticalSpacing={2} horizontalSpacing="xs" w="fit-content">
      <Table.Thead>
        <Table.Tr>
          <Table.Th />
          {shown.map((status) => (
            <Table.Th key={status} ta="right">
              <Text size="xs" c="dimmed" fw={500} tt="capitalize">
                {status}
              </Text>
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {kinds.map((kind) => (
          <Table.Tr key={kind}>
            <Table.Td>
              <Group gap="xxs" wrap="nowrap">
                <KindGlyph catalog={catalog} kind={kind} />
                <Text size="sm">
                  {capitalize(catalog?.derivedKinds.find((candidate) => candidate.key === kind)?.plural ?? kind)}
                </Text>
              </Group>
            </Table.Td>
            {shown.map((status) => (
              <Table.Td key={status} ta="right">
                <Text size="sm" {...stylex.props(styles.numeric)}>
                  {counts.find((entry) => entry.kind === kind && entry.status === status)?.count ?? "·"}
                </Text>
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** Where to go from a place: each kind's library filtered to it, and the recall inspector standing there. */
function PlaceOnwardLinks({ place }: { place: string }) {
  const catalog = useReviewCatalog();
  const kinds = catalog?.derivedKinds ?? [];
  const [onlyKind] = kinds;
  return (
    <Group gap="xxs" {...stylex.props(styles.onward)}>
      {kinds.length === 1 && onlyKind !== undefined ? (
        <AnchorLink to="/kinds/$kind" params={{ kind: onlyKind.key }} search={{ place }} size="sm">
          What applies here →
        </AnchorLink>
      ) : (
        <>
          <Text size="sm" c="dark.4">
            What applies here:
          </Text>
          {kinds.map((kind) => (
            <AnchorLink key={kind.key} to="/kinds/$kind" params={{ kind: kind.key }} search={{ place }} size="sm">
              <Group gap="2xs" wrap="nowrap" component="span">
                <KindGlyph catalog={catalog} kind={kind.key} />
                {capitalize(kind.plural)}
              </Group>
            </AnchorLink>
          ))}
        </>
      )}
      <Text size="sm" c="gray.4" aria-hidden>
        ·
      </Text>
      <AnchorLink to="/recall" search={{ at: place }} size="sm">
        Recall here →
      </AnchorLink>
    </Group>
  );
}

/** Whether the reviewer's probes reach this place, said only when it matters. */
function ProbeReachNotice({
  probeCount,
  unmatched,
  acceptedHereCount,
  matchingProbes,
}: {
  probeCount: number;
  unmatched: AuditPlacesResult["audit"]["unmatched"][number] | undefined;
  acceptedHereCount: number;
  matchingProbes: AuditPlacesResult["audit"]["probes"];
}) {
  if (unmatched !== undefined)
    return (
      <Alert
        color="orange"
        variant="light"
        icon={<TriangleAlert size={16} />}
        title={probeCount === 1 ? "Unmatched by your probe" : "Unmatched by your probes"}
      >
        {probeCount === 1 ? "Your probe doesn't reach it" : `None of your ${probeCount} probes reach it`}, so{" "}
        {unmatched.derivations.length === 1
          ? "this accepted item"
          : `these ${unmatched.derivations.length} accepted items`}{" "}
        would never apply from there. If the place moved, repoint it.
      </Alert>
    );
  if (acceptedHereCount === 0) return null;
  return (
    <Text size="xs" c="tastebud.8">
      Reached by {matchingProbes.map((probe) => probe.probe).join(", ") || "your probes"}.
    </Text>
  );
}

/** What names this exact place. While the list loads it reads as empty, not as a spinner. */
function ScopedHereList({ error, rows }: { error: Error | null; rows: ReadonlyArray<DerivationSummary> }) {
  const catalog = useReviewCatalog();
  if (error) return <QueryErrorAlert error={error} />;
  if (rows.length === 0)
    return (
      <Text size="sm" c="dimmed">
        Nothing names this exact place.
      </Text>
    );
  return rows.map((row) => <DerivationSummaryLine catalog={catalog} key={row.id} summary={row} />);
}

export function PlaceDetails({
  place,
  audit,
  probes,
  known,
}: {
  place: string;
  audit: AuditPlacesResult;
  probes: ReadonlyArray<string>;
  known: KnownPlaces;
}) {
  const catalog = useReviewCatalog();
  const [repointing, setRepointing] = useState(false);
  const all = useQuery(derivationListQuery({}));
  if (place === GLOBAL_PLACE_NODE) {
    const rows = (all.data ?? []).filter((row) => row.effectiveScope.scope === "global");
    return (
      <Stack gap="md">
        <Group gap="xs">
          <Globe size={16} color="var(--mantine-color-orange-6)" />
          <Title order={4}>Everywhere</Title>
        </Group>
        <Text size="sm" c="dimmed">
          Global items apply in every place, including ones that don't exist yet, and in unknown contexts.
        </Text>
        <CountsTable counts={audit.globalCounts} />
        <Stack gap="xxs">
          {rows.map((row) => (
            <DerivationSummaryLine catalog={catalog} key={row.id} summary={row} />
          ))}
        </Stack>
      </Stack>
    );
  }
  const entry = audit.places.find((candidate) => candidate.place === place);
  const unmatched = audit.audit.unmatched.find((candidate) => candidate.place === place);
  const scopedHere = (all.data ?? []).filter((row) => scopePlacesOf(row.effectiveScope).includes(place));
  const acceptedHere = scopedHere.filter((row) => row.status === "accepted");
  const matchingProbes = audit.audit.probes.filter((probe) =>
    probe.places.some((reached) => placeCovers(place, reached)),
  );
  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap="2xs" {...stylex.props(styles.shrinkable)}>
          <Group gap="xs" wrap="nowrap">
            <PlaceFormIcon place={place} size={16} />
            <Title order={4}>{known.labelOf(place)}</Title>
          </Group>
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              {PLACE_FORM_NAMES[placeFormOf(place)]}
            </Text>
            <PlaceKeyCopy place={place} />
          </Group>
        </Stack>
        <Button
          size="xs"
          variant="default"
          onClick={() => setRepointing(true)}
          disabled={acceptedHere.length === 0}
          title={acceptedHere.length === 0 ? "Nothing accepted is scoped here" : undefined}
        >
          Repoint…
        </Button>
      </Group>
      <PlaceOnwardLinks place={place} />

      {probes.length > 0 && (
        <ProbeReachNotice
          probeCount={probes.length}
          unmatched={unmatched}
          acceptedHereCount={acceptedHere.length}
          matchingProbes={matchingProbes}
        />
      )}

      <CountsTable counts={entry?.counts ?? []} />

      <Stack gap="xxs">
        <Text size="sm" fw={600}>
          Scoped here
        </Text>
        <ScopedHereList error={all.error} rows={scopedHere} />
      </Stack>
      <PlaceRepointSheet from={place} opened={repointing} onClose={() => setRepointing(false)} known={known} />
    </Stack>
  );
}
