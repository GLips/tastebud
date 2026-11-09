/**
 * The Places page's right column: everything that reaches one place, accepted first, each with the
 * place it comes from (here, a parent, or everywhere), then what waits for you and what you turned
 * down. Moving the place (repoint) sits in the header menu.
 */
import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  CopyButton,
  Group,
  Loader,
  Menu,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { placeCovers } from "@tastebud/core/places";
import type { AuditPlacesResult } from "@tastebud/core/places-audit";
import { Check, Copy, Ellipsis, Globe, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { derivationListQuery } from "#review/features/derivation-library/index.ts";
import { useReviewCatalog } from "#review/features/review-shell/index.ts";
import { GLOBAL_PLACE_NODE } from "#review/shared/known-place-labels.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { CountedTabs } from "#review/shared/ui/counted-tabs.tsx";
import { FactList, FactRow } from "#review/shared/ui/fact-row.tsx";
import { findKindView, KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { PLACE_FORM_NAMES, PlaceFormIcon, placeFormOf } from "#review/shared/ui/place-chips.tsx";
import { RecallPolicyChip } from "#review/shared/ui/policy-chip.tsx";
import { QueryErrorAlert } from "#review/shared/ui/route-panels.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { DerivationStatusBadge } from "#review/shared/ui/status-chips.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import { type PlaceReachRow, type PlaceReachTab, placeReachOf } from "./place-applicability.ts";
import { PlaceRepointSheet } from "./place-repoint-sheet.tsx";

const styles = stylex.create({
  shrinkable: { minWidth: 0 },
  row: {
    display: "grid",
    gridTemplateColumns: "14px minmax(0, 1fr) 130px 190px",
    columnGap: "8px",
    alignItems: "baseline",
    paddingBlock: "8px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: { default: "var(--mantine-color-gray-1)", ":first-child": "transparent" },
  },
  origin: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", justifySelf: "start" },
  columnHead: { paddingBlock: "2px" },
  key: { fontFamily: "var(--mantine-font-family-monospace)", overflowWrap: "anywhere" },
});

/** The full place key, copied on click. */
function PlaceKeyCopyButton({ place }: { place: string }) {
  return (
    <CopyButton value={place}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Copied" : "Copy the key"} withArrow fz="xs">
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

/** The table's third column: how a row reaches agents, given which tab it is in. */
type ReachColumn = "delivery" | "waiting" | "settled";

const REACH_COLUMN_TITLES: Record<ReachColumn, string> = {
  delivery: "How agents get it",
  waiting: "Once accepted",
  settled: "Status",
};

function ReachCell({ row, column }: { row: PlaceReachRow; column: ReachColumn }) {
  const catalog = useReviewCatalog();
  const kind = findKindView(catalog, row.summary.kind);
  if (column === "settled") return <DerivationStatusBadge status={row.summary.status} />;
  return kind === undefined ? null : <RecallPolicyChip policy={kind.recall} />;
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
        <Text size="xs" c="dimmed" fw={500}>
          Statement
        </Text>
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

interface ReachTabView {
  readonly value: PlaceReachTab;
  readonly label: string;
  readonly rows: ReadonlyArray<PlaceReachRow>;
  readonly column: ReachColumn;
}

/** The detail's tab strip: what applies, what waits for you, what doesn't apply, each with its count. */
function ReachTabs({
  reach,
  place,
  known,
  onSelect,
  tab,
  onTabChange,
}: {
  reach: ReturnType<typeof placeReachOf>;
  place: string;
  known: KnownPlaces;
  onSelect: (place: string) => void;
  /** The tab in the URL; without one, the first tab with rows. */
  tab: PlaceReachTab | undefined;
  onTabChange: (tab: PlaceReachTab) => void;
}) {
  const applies: ReachTabView = { value: "applies", label: "Applies", rows: reach.applies, column: "delivery" };
  const tabs: ReadonlyArray<ReachTabView> = [
    applies,
    { value: "waiting", label: "Waiting", rows: reach.waiting, column: "waiting" },
    { value: "settled", label: "Doesn't apply", rows: reach.settledAgainst, column: "settled" },
  ];
  const shown =
    tabs.find((candidate) => candidate.value === tab) ?? tabs.find((candidate) => candidate.rows.length > 0) ?? applies;
  return (
    <Stack gap="xs">
      <Group gap="sm" justify="space-between">
        <CountedTabs
          label="Reach"
          value={shown.value}
          onChange={onTabChange}
          options={tabs.map((candidate) => ({
            value: candidate.value,
            label: candidate.label,
            count: candidate.rows.length,
          }))}
        />
        <AnchorLink to="/recall" search={place === GLOBAL_PLACE_NODE ? { nowhere: true } : { at: place }} size="sm">
          Open in Recall →
        </AnchorLink>
      </Group>
      {shown.rows.length === 0 ? (
        <Text size="sm" c="dimmed" py="sm">
          Nothing here.
        </Text>
      ) : (
        <ReachRows rows={shown.rows} known={known} onSelect={onSelect} column={shown.column} />
      )}
    </Stack>
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

export function PlaceDetails({
  place,
  audit,
  probes,
  known,
  onSelect,
  tab,
  onTabChange,
}: {
  place: string;
  audit: AuditPlacesResult;
  probes: ReadonlyArray<string>;
  known: KnownPlaces;
  onSelect: (place: string) => void;
  tab: PlaceReachTab | undefined;
  onTabChange: (tab: PlaceReachTab) => void;
}) {
  const [repointing, setRepointing] = useState(false);
  const all = useQuery(derivationListQuery({}));
  const isGlobal = place === GLOBAL_PLACE_NODE;
  const reach = placeReachOf(place, all.data ?? []);
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
              <Title order={4}>{known.labelOf(place)}</Title>
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
        {!isGlobal && (
          <FactList>
            <FactRow label="Type">
              <Text size="sm">{PLACE_FORM_NAMES[placeFormOf(place)]}</Text>
            </FactRow>
            <FactRow label="Key">
              <Group gap="2xs" wrap="nowrap">
                <Text fz="xs" {...stylex.props(styles.key)}>
                  {place}
                </Text>
                <PlaceKeyCopyButton place={place} />
              </Group>
            </FactRow>
          </FactList>
        )}
      </Stack>

      {all.error && <QueryErrorAlert error={all.error} />}
      {/* Until the derivations load, an empty table would read as "nothing applies here". */}
      {all.data === undefined && !all.error && <Loader size="sm" />}
      {all.data !== undefined && (
        <>
          {probes.length > 0 && !isGlobal && (
            <ProbeReachNotice
              probeCount={probes.length}
              unmatched={unmatched}
              acceptedHereCount={acceptedScopedHere.length}
              matchingProbes={matchingProbes}
            />
          )}

          <ReachTabs
            reach={reach}
            place={place}
            known={known}
            onSelect={onSelect}
            tab={tab}
            onTabChange={onTabChange}
          />
        </>
      )}
    </Stack>
  );
}
