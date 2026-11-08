/**
 * The Places page's right column: everything that reaches one place, accepted first, each with the
 * place it comes from (here, a parent, or everywhere), then what waits for you and what you turned
 * down. Repoint and the probe audit sit below as secondary tools.
 */
import { Alert, Anchor, Box, Button, Collapse, Group, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import { placeCovers, scopePlacesOf } from "@tastebud/core/places";
import type { AuditPlacesResult } from "@tastebud/core/places-audit";
import type { DerivationStatus } from "@tastebud/core/taste-vocabulary";
import { ChevronRight, Globe, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";

import { derivationListQuery } from "#review/features/derivation-library/index.ts";
import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { GLOBAL_PLACE_NODE } from "#review/shared/known-place-labels.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { capitalize, describeKindDelivery, KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { PLACE_FORM_NAMES, PlaceFormIcon, placeFormOf, PlaceKeyCopy } from "#review/shared/ui/place-chips.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";

import { type PlaceReachRow, placeReachOf } from "./place-applicability.ts";
import { PlaceRepointSheet } from "./place-repoint-sheet.tsx";

const styles = stylex.create({
  shrinkable: { minWidth: 0 },
  row: {
    display: "grid",
    gridTemplateColumns: "12px minmax(0, 1fr) auto",
    columnGap: "8px",
    alignItems: "baseline",
    paddingBlock: "6px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: { default: "var(--mantine-color-gray-1)", ":first-child": "transparent" },
  },
  origin: { whiteSpace: "nowrap" },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
});

const SETTLED_STATUS_WORDS: Partial<Record<DerivationStatus, string>> = {
  rejected: "Rejected",
  retracted: "Retracted",
  superseded: "Replaced by a newer revision",
};

/** Where a row reaches this place from, in words; a parent is a link that opens it. */
function ReachOrigin({
  row,
  known,
  onSelect,
}: {
  row: PlaceReachRow;
  known: KnownPlaces;
  onSelect: (place: string) => void;
}) {
  const { origin } = row;
  if (origin.from === "here")
    return (
      <Text size="xs" c="dimmed" {...stylex.props(styles.origin)}>
        Scoped here
      </Text>
    );
  if (origin.from === "everywhere")
    return (
      <Group gap="2xs" wrap="nowrap" {...stylex.props(styles.origin)}>
        <Globe size={11} color="var(--mantine-color-orange-6)" />
        <Text size="xs" c="orange.8">
          Everywhere
        </Text>
      </Group>
    );
  return (
    <Anchor
      component="button"
      type="button"
      size="xs"
      c="dimmed"
      onClick={() => onSelect(origin.place)}
      {...stylex.props(styles.origin)}
    >
      From {known.labelOf(origin.place)}
    </Anchor>
  );
}

function ReachRows({
  rows,
  known,
  onSelect,
  showStatus = false,
}: {
  rows: ReadonlyArray<PlaceReachRow>;
  known: KnownPlaces;
  onSelect: (place: string) => void;
  showStatus?: boolean;
}) {
  const catalog = useReviewCatalog();
  return (
    <Box>
      {rows.map((row) => (
        <Box key={row.summary.id} {...stylex.props(styles.row)}>
          <KindGlyph catalog={catalog} kind={row.summary.kind} label={row.summary.kindLabel} size={10} />
          <Text size="sm">
            <AnchorLink to="/derivations/$id" params={{ id: row.summary.id }} size="sm" c="inherit" underline="hover">
              {row.summary.statement}
            </AnchorLink>
            {showStatus && (
              <Text span size="xs" c={row.summary.status === "rejected" ? "red.7" : "dimmed"}>
                {" "}
                · {SETTLED_STATUS_WORDS[row.summary.status]}
                {row.summary.reason !== undefined && `: “${row.summary.reason}”`}
              </Text>
            )}
          </Text>
          <ReachOrigin row={row} known={known} onSelect={onSelect} />
        </Box>
      ))}
    </Box>
  );
}

function ReachSection({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <Stack gap="3xs">
      <Text size="sm" fw={600}>
        {title}
      </Text>
      <Text size="xs" c="dimmed">
        {hint}
      </Text>
      {children}
    </Stack>
  );
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** One sentence that answers "what applies here?" before the lists. */
function reachSummary(rows: ReadonlyArray<PlaceReachRow>, known: KnownPlaces): string {
  if (rows.length === 0) return "Nothing you've accepted applies here yet.";
  const here = rows.filter((row) => row.origin.from === "here").length;
  const everywhere = rows.filter((row) => row.origin.from === "everywhere").length;
  const parents = [...new Set(rows.flatMap((row) => (row.origin.from === "parent" ? [row.origin.place] : [])))];
  const parts = [
    ...(here > 0 ? [`${here} scoped here`] : []),
    ...parents.map(
      (parent) =>
        `${rows.filter((row) => row.origin.from === "parent" && row.origin.place === parent).length} from ${known.labelOf(parent)}`,
    ),
    ...(everywhere > 0 ? [`${everywhere} everywhere`] : []),
  ];
  return `${plural(rows.length, "accepted item applies", "accepted items apply")} here: ${parts.join(", ")}.`;
}

/** What agents actually get of the accepted rows, kind by kind, from each kind's recall policy. */
function appliesHint(rows: ReadonlyArray<PlaceReachRow>, catalog: CatalogView | undefined): string {
  const kinds = (catalog?.derivedKinds ?? []).filter((kind) => rows.some((row) => row.summary.kind === kind.key));
  return kinds.map((kind) => describeKindDelivery(kind)).join(" ");
}

/** Each kind's library filtered to this place, and the recall inspector standing here. */
function PlaceOnwardLinks({ place }: { place: string }) {
  const catalog = useReviewCatalog();
  return (
    <Group gap="xs">
      {(catalog?.derivedKinds ?? []).map((kind) => (
        <AnchorLink key={kind.key} to="/kinds/$kind" params={{ kind: kind.key }} search={{ place }} size="xs">
          <Group gap="2xs" wrap="nowrap" component="span">
            <KindGlyph catalog={catalog} kind={kind.key} />
            {capitalize(kind.plural)} here
          </Group>
        </AnchorLink>
      ))}
      <AnchorLink to="/recall" search={place === GLOBAL_PLACE_NODE ? {} : { at: place }} size="xs">
        Try recall here →
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
        title={probeCount === 1 ? "Your checked folder doesn't reach it" : "None of your checked folders reach it"}
      >
        {unmatched.derivations.length === 1
          ? "This accepted item"
          : `These ${unmatched.derivations.length} accepted items`}{" "}
        would never apply from {probeCount === 1 ? "that folder" : `those ${probeCount} folders`}. If the place moved,
        repoint it.
      </Alert>
    );
  if (acceptedHereCount === 0) return null;
  return (
    <Text size="xs" c="tastebud.8">
      Reached from {matchingProbes.map((probe) => probe.probe).join(", ") || "your checked folders"}.
    </Text>
  );
}

function SettledAgainst({
  rows,
  known,
  onSelect,
}: {
  rows: ReadonlyArray<PlaceReachRow>;
  known: KnownPlaces;
  onSelect: (place: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  return (
    <Stack gap="3xs">
      <UnstyledButton onClick={() => setOpen(!open)} aria-expanded={open}>
        <Group gap="2xs">
          <ChevronRight
            size={13}
            color="var(--mantine-color-gray-6)"
            {...stylex.props(styles.chevron, open && styles.chevronOpen)}
          />
          <Text size="sm" fw={600}>
            Doesn't apply
          </Text>
          <Text size="xs" c="dimmed">
            {plural(rows.length, "item", "items")} you rejected, retracted or replaced. Agents are told about rejections
            so they don't propose them again.
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>
        <ReachRows rows={rows} known={known} onSelect={onSelect} showStatus />
      </Collapse>
    </Stack>
  );
}

export function PlaceDetails({
  place,
  audit,
  probes,
  known,
  onSelect,
}: {
  place: string;
  audit: AuditPlacesResult;
  probes: ReadonlyArray<string>;
  known: KnownPlaces;
  onSelect: (place: string) => void;
}) {
  const catalog = useReviewCatalog();
  const [repointing, setRepointing] = useState(false);
  const all = useQuery(derivationListQuery({}));
  const isGlobal = place === GLOBAL_PLACE_NODE;
  const reach = placeReachOf(place, all.data ?? []);
  const acceptedScopedHere = reach.applies.filter((row) => row.origin.from === "here");
  const unmatched = audit.audit.unmatched.find((candidate) => candidate.place === place);
  const matchingProbes = audit.audit.probes.filter((probe) =>
    probe.places.some((reached) => placeCovers(place, reached)),
  );
  const scopedHereCount = (all.data ?? []).filter((row) => scopePlacesOf(row.effectiveScope).includes(place)).length;
  return (
    <Stack gap="md">
      <Stack gap="2xs" {...stylex.props(styles.shrinkable)}>
        {isGlobal ? (
          <Group gap="xs">
            <Globe size={16} color="var(--mantine-color-orange-6)" />
            <Title order={4}>Everywhere</Title>
          </Group>
        ) : (
          <>
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
          </>
        )}
        <PlaceOnwardLinks place={place} />
      </Stack>

      {all.error ? (
        <QueryErrorAlert error={all.error} />
      ) : (
        <>
          <Text size="sm">
            {isGlobal
              ? `Global items apply in every place, including ones that don't exist yet. ${plural(reach.applies.length, "accepted item is", "accepted items are")} global.`
              : reachSummary(reach.applies, known)}
          </Text>

          {probes.length > 0 && !isGlobal && (
            <ProbeReachNotice
              probeCount={probes.length}
              unmatched={unmatched}
              acceptedHereCount={acceptedScopedHere.length}
              matchingProbes={matchingProbes}
            />
          )}

          {reach.applies.length > 0 && (
            <ReachSection title="Applies here" hint={appliesHint(reach.applies, catalog)}>
              <ReachRows rows={reach.applies} known={known} onSelect={onSelect} />
            </ReachSection>
          )}

          {reach.waiting.length > 0 && (
            <ReachSection
              title="Waiting for you"
              hint="Proposed to apply here. Nothing reaches agents until you accept it in the inbox."
            >
              <ReachRows rows={reach.waiting} known={known} onSelect={onSelect} />
            </ReachSection>
          )}

          <SettledAgainst rows={reach.settledAgainst} known={known} onSelect={onSelect} />
        </>
      )}

      {!isGlobal && scopedHereCount > 0 && (
        <Group gap="xs" pt="xs">
          <Text size="xs" c="dimmed">
            Moved or renamed this place? Repoint proposes a revision of each accepted item here, pointing at the new
            place, for you to accept.
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => setRepointing(true)}
            disabled={acceptedScopedHere.length === 0}
            title={acceptedScopedHere.length === 0 ? "Nothing accepted is scoped exactly here" : undefined}
          >
            Repoint…
          </Button>
          <PlaceRepointSheet from={place} opened={repointing} onClose={() => setRepointing(false)} known={known} />
        </Group>
      )}
    </Stack>
  );
}
