/**
 * The Places page's right column: everything that reaches one place, accepted first, each with the
 * place it comes from (here, a parent, or everywhere), then what waits for you and what you turned
 * down. Moving the place (repoint) sits in the header menu.
 */
import {
  ActionIcon,
  Alert,
  Anchor,
  Loader,
  Box,
  Collapse,
  CopyButton,
  Group,
  Menu,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import { placeCovers } from "@tastebud/core/places";
import type { AuditPlacesResult } from "@tastebud/core/places-audit";
import type { DerivationStatus } from "@tastebud/core/taste-vocabulary";
import { Check, ChevronRight, Copy, Ellipsis, Globe, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";

import { derivationListQuery } from "#review/features/derivation-library/index.ts";
import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { GLOBAL_PLACE_NODE } from "#review/shared/known-place-labels.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { capitalize, findKindView, KindGlyph, RECALL_POLICY_LABELS } from "#review/shared/ui/kind-identity.tsx";
import { PLACE_FORM_NAMES, PlaceFormIcon, placeFormOf } from "#review/shared/ui/place-chips.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import { type PlaceReachRow, placeReachOf } from "./place-applicability.ts";
import { PlaceRepointSheet } from "./place-repoint-sheet.tsx";
import { totalPlaceCount } from "./place-tree.ts";

const styles = stylex.create({
  shrinkable: { minWidth: 0 },
  row: {
    display: "grid",
    gridTemplateColumns: "14px minmax(0, 1fr) 130px 190px",
    columnGap: "8px",
    alignItems: "baseline",
    paddingBlock: "6px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: { default: "var(--mantine-color-gray-1)", ":first-child": "transparent" },
  },
  origin: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", justifySelf: "start" },
  columnHead: { paddingBlock: "2px" },
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
});

const SETTLED_STATUS_WORDS: Partial<Record<DerivationStatus, string>> = {
  rejected: "Rejected",
  retracted: "Retracted",
  superseded: "Replaced by a newer revision",
};

/** The full place key, copied on click; it shows only in the tooltip, never in the header line. */
function PlaceKeyCopyButton({ place }: { place: string }) {
  return (
    <CopyButton value={place}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Copied" : `Copy the key: ${place}`} withArrow fz="xs">
          <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Copy the place key" onClick={copy}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

/** Where a row reaches this place from; a parent is a link that opens it. Everywhere stays neutral. */
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
      <SupportingText tier="secondary" {...stylex.props(styles.origin)}>
        Here
      </SupportingText>
    );
  if (origin.from === "everywhere")
    return (
      <Group gap="2xs" wrap="nowrap" {...stylex.props(styles.origin)}>
        <Globe size={11} color="var(--mantine-color-gray-6)" />
        <SupportingText tier="secondary">Everywhere</SupportingText>
      </Group>
    );
  return (
    <SupportingText tier="secondary" {...stylex.props(styles.origin)}>
      <Anchor
        component="button"
        type="button"
        inherit
        c="inherit"
        underline="always"
        onClick={() => onSelect(origin.place)}
      >
        {known.labelOf(origin.place)}
      </Anchor>
    </SupportingText>
  );
}

/** The table's third column: how a row reaches agents, given which list it is in. */
type ReachColumn = "delivery" | "waiting" | "settled";

const REACH_COLUMN_TITLES: Record<ReachColumn, string> = {
  delivery: "How agents get it",
  waiting: "How agents get it",
  settled: "Status",
};

function ReachCell({ row, column }: { row: PlaceReachRow; column: ReachColumn }) {
  const catalog = useReviewCatalog();
  const kind = findKindView(catalog, row.summary.kind);
  if (column === "waiting")
    return (
      <SupportingText tier="secondary">
        {kind?.recall === "never" ? `Never sent (${kind.plural} stay in your backlog)` : "Not until accepted"}
      </SupportingText>
    );
  if (column === "settled")
    return <SupportingText tier="secondary">{SETTLED_STATUS_WORDS[row.summary.status]}</SupportingText>;
  if (kind === undefined) return null;
  return (
    // What is sent takes the accent; the rest reads in the secondary tier.
    kind.recall === "inject" ? (
      <Text size="sm" c="tastebud.8">
        {RECALL_POLICY_LABELS[kind.recall]}
      </Text>
    ) : (
      <SupportingText tier="secondary">{RECALL_POLICY_LABELS[kind.recall]}</SupportingText>
    )
  );
}

function ReachRows({
  rows,
  known,
  onSelect,
  column,
}: {
  rows: ReadonlyArray<PlaceReachRow>;
  known: KnownPlaces;
  onSelect: (place: string) => void;
  column: ReachColumn;
}) {
  const catalog = useReviewCatalog();
  return (
    <Box>
      <Box {...stylex.props(styles.row, styles.columnHead)} aria-hidden>
        <Box />
        <Box />
        <Text size="xs" c="dimmed" fw={500}>
          Set on
        </Text>
        <Text size="xs" c="dimmed" fw={500}>
          {REACH_COLUMN_TITLES[column]}
        </Text>
      </Box>
      {rows.map((row) => (
        <Box key={row.summary.id} {...stylex.props(styles.row)}>
          <KindGlyph catalog={catalog} kind={row.summary.kind} label={row.summary.kindLabel} size={12} />
          <Text size="sm">
            <AnchorLink to="/derivations/$id" params={{ id: row.summary.id }} size="sm" c="inherit" underline="hover">
              {row.summary.statement}
            </AnchorLink>
            {column === "settled" && row.summary.reason !== undefined && (
              <SupportingText span tier="secondary">
                {" "}
                · “{row.summary.reason}”
              </SupportingText>
            )}
          </Text>
          <ReachOrigin row={row} known={known} onSelect={onSelect} />
          <ReachCell row={row} column={column} />
        </Box>
      ))}
    </Box>
  );
}

function ReachSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="3xs">
      <Text size="sm" fw={600}>
        {title}
      </Text>
      {children}
    </Stack>
  );
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The count line above the table. Its first number is the sidebar's (everything scoped to this place,
 * any status); the next counts what applies here including what parents and Everywhere pass down, and
 * splits it into what reaches agents (the number Recall shows here) and what stays in the backlog.
 */
function reachCountLine(
  scopedCount: number,
  rows: ReadonlyArray<PlaceReachRow>,
  catalog: CatalogView | undefined,
  isGlobal: boolean,
): string {
  const backlog = rows.filter((row) => findKindView(catalog, row.summary.kind)?.recall === "never").length;
  const applies = isGlobal
    ? `${rows.length} accepted apply in every place`
    : `${rows.length} accepted apply here (including inherited)`;
  const split = [`${rows.length - backlog} reach agents`, ...(backlog > 0 ? [`${backlog} stay in your backlog`] : [])];
  return `${plural(scopedCount, "item", "items")} scoped ${isGlobal ? "everywhere" : "here"} · ${applies}: ${split.join(", ")}`;
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
      <AnchorLink to="/recall" search={place === GLOBAL_PLACE_NODE ? { nowhere: true } : { at: place }} size="xs">
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
          <SupportingText tier="secondary">
            {plural(rows.length, "item", "items")} you rejected, retracted or replaced. Agents are told about rejections
            so they don't propose them again.
          </SupportingText>
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>
        <ReachRows rows={rows} known={known} onSelect={onSelect} column="settled" />
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
  const scopedCount = totalPlaceCount(
    isGlobal ? audit.globalCounts : (audit.places.find((entry) => entry.place === place)?.counts ?? []),
  );
  const acceptedScopedHere = reach.applies.filter((row) => row.origin.from === "here");
  const unmatched = audit.audit.unmatched.find((candidate) => candidate.place === place);
  const matchingProbes = audit.audit.probes.filter((probe) =>
    probe.places.some((reached) => placeCovers(place, reached)),
  );
  return (
    <Stack gap="md">
      <Stack gap="2xs" {...stylex.props(styles.shrinkable)}>
        {isGlobal ? (
          <Group gap="xs">
            <Globe size={16} color="var(--mantine-color-gray-6)" />
            <Title order={4}>Everywhere</Title>
          </Group>
        ) : (
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Group gap="xs" wrap="nowrap" {...stylex.props(styles.shrinkable)}>
              <PlaceFormIcon place={place} size={16} />
              <Tooltip label={place} withArrow openDelay={300} fz="xs">
                <Title order={4}>{known.labelOf(place)}</Title>
              </Tooltip>
              <SupportingText tier="secondary">{PLACE_FORM_NAMES[placeFormOf(place)]}</SupportingText>
              <PlaceKeyCopyButton place={place} />
            </Group>
            {acceptedScopedHere.length > 0 && (
              <Menu position="bottom-end" withArrow>
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" aria-label="More for this place">
                    <Ellipsis size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={() => setRepointing(true)}>
                    <Text size="sm">Move these to another place…</Text>
                    <SupportingText tier="secondary" maw={260}>
                      Proposes a revision of each accepted item scoped exactly here, pointing at the new place. Each
                      replaces the old one when you accept it.
                    </SupportingText>
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
            <PlaceRepointSheet from={place} opened={repointing} onClose={() => setRepointing(false)} known={known} />
          </Group>
        )}
        <PlaceOnwardLinks place={place} />
      </Stack>

      {all.error && <QueryErrorAlert error={all.error} />}
      {/* Until the derivations load, an empty table would read as "nothing applies here". */}
      {all.data === undefined && !all.error && <Loader size="sm" />}
      {all.data !== undefined && (
        <>
          <Text size="sm">
            {reach.applies.length === 0 && reach.waiting.length === 0
              ? "Nothing you've accepted applies here yet."
              : reachCountLine(scopedCount, reach.applies, catalog, isGlobal)}
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
            <ReachSection title="Applies here">
              <ReachRows rows={reach.applies} known={known} onSelect={onSelect} column="delivery" />
            </ReachSection>
          )}

          {reach.waiting.length > 0 && (
            <ReachSection title="Waiting for you">
              <ReachRows rows={reach.waiting} known={known} onSelect={onSelect} column="waiting" />
            </ReachSection>
          )}

          <SettledAgainst rows={reach.settledAgainst} known={known} onSelect={onSelect} />
        </>
      )}
    </Stack>
  );
}
