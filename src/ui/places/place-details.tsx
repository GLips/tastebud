/** The Places page's right column: one place's counts, what is scoped to it, and whether probes reach it. */
import { Alert, Button, Group, Stack, Table, Text, Title } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Globe, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { AuditPlacesResult } from "../../core/index.ts";
import { placeCovers, scopePlacesOf } from "../../shared/places.ts";
import { DerivationSummaryLine } from "../derivation-link.tsx";
import { capitalize, KindGlyph } from "../kind-identity.tsx";
import { PLACE_FORM_NAMES, PlaceFormIcon, PlaceKeyCopy, placeFormOf } from "../place-chips.tsx";
import { derivationListQuery } from "../review-queries.ts";
import { QueryErrorAlert } from "../route-panels.tsx";
import { AnchorLink } from "../router-links.tsx";
import { type KnownPlaces, useReviewCatalog } from "../use-review-context.ts";
import { PlaceRepointSheet } from "./place-repoint-sheet.tsx";
import { GLOBAL_PLACE_NODE } from "./place-tree.ts";

const styles = stylex.create({
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
              <Group gap={6} wrap="nowrap">
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
    <Group gap={6} {...stylex.props(styles.onward)}>
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
              <Group gap={4} wrap="nowrap" component="span">
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
  const [repointing, setRepointing] = useState(false);
  const all = useQuery(derivationListQuery({}));
  if (place === GLOBAL_PLACE_NODE) {
    const rows = (all.data ?? []).filter((row) => row.effectiveScope.scope === "global");
    return (
      <Stack gap="md">
        <Group gap={8}>
          <Globe size={16} color="var(--mantine-color-orange-6)" />
          <Title order={4}>Everywhere</Title>
        </Group>
        <Text size="sm" c="dimmed">
          Global items apply in every place, including ones that don't exist yet, and in unknown contexts.
        </Text>
        <CountsTable counts={audit.globalCounts} />
        <Stack gap={6}>
          {rows.map((row) => (
            <DerivationSummaryLine key={row.id} summary={row} />
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
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap={8} wrap="nowrap">
            <PlaceFormIcon place={place} size={16} />
            <Title order={4}>{known.labelOf(place)}</Title>
          </Group>
          <Group gap={8}>
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

      {probes.length > 0 &&
        (unmatched !== undefined ? (
          <Alert
            color="orange"
            variant="light"
            icon={<TriangleAlert size={16} />}
            title={probes.length === 1 ? "Unmatched by your probe" : "Unmatched by your probes"}
          >
            {probes.length === 1 ? "Your probe doesn't reach it" : `None of your ${probes.length} probes reach it`}, so{" "}
            {unmatched.derivations.length === 1
              ? "this accepted item"
              : `these ${unmatched.derivations.length} accepted items`}{" "}
            would never apply from there. If the place moved, repoint it.
          </Alert>
        ) : acceptedHere.length > 0 ? (
          <Text size="xs" c="taste.8">
            Reached by {matchingProbes.map((probe) => probe.probe).join(", ") || "your probes"}.
          </Text>
        ) : null)}

      <CountsTable counts={entry?.counts ?? []} />

      <Stack gap={6}>
        <Text size="sm" fw={600}>
          Scoped here
        </Text>
        {all.error ? (
          <QueryErrorAlert error={all.error} />
        ) : scopedHere.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nothing names this exact place.
          </Text>
        ) : (
          scopedHere.map((row) => <DerivationSummaryLine key={row.id} summary={row} />)
        )}
      </Stack>
      <PlaceRepointSheet from={place} opened={repointing} onClose={() => setRepointing(false)} known={known} />
    </Stack>
  );
}
