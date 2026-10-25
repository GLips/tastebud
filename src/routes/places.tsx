import {
  ActionIcon,
  Alert,
  Autocomplete,
  Button,
  Center,
  Drawer,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Result, Schema } from "effect";
import { ArrowRight, Globe, LocateFixed, Plus, Search, TriangleAlert, X } from "lucide-react";
import { useState } from "react";

import type { AuditPlacesResult, DerivationRow } from "../core/index.ts";
import { repointReviewPlace } from "../server/review-functions.ts";
import { unwrapReviewOutcome } from "../server/review-outcome.ts";
import { canonicalPlaceKey, type PlaceKey, placeCovers, scopePlacesOf } from "../shared/places.ts";
import { DerivationSummaryLine } from "../ui/derivation-link.tsx";
import { capitalize, KindGlyph } from "../ui/kind-identity.tsx";
import { PLACE_FORM_NAMES, PlaceChip, PlaceFormIcon, PlaceKeyCopy, placeFormOf } from "../ui/place-chips.tsx";
import { buildPlaceTree, filterPlaceTree, type PlaceTreeNode } from "../ui/place-tree.ts";
import { derivationListQuery, placesAuditQuery, reviewContextQuery } from "../ui/review-queries.ts";
import { QueryErrorAlert } from "../ui/route-panels.tsx";
import { AnchorLink } from "../ui/router-links.tsx";
import { type KnownPlaces, useKnownPlaces, useReviewCatalog } from "../ui/use-review-context.ts";

const PlacesSearch = Schema.Struct({ place: Schema.optionalKey(Schema.String) });

export const Route = createFileRoute("/places")({
  validateSearch: Schema.toStandardSchemaV1(PlacesSearch),
  component: PlacesScreen,
});

/** The probes live in the browser: the audit is only ever "unmatched by these", never "broken". */
const PROBES_STORAGE_KEY = "taste.places.probes";
const GLOBAL_NODE = "(global)";

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "300px minmax(0, 1fr)", "@media (max-width: 860px)": "minmax(0, 1fr)" },
    gap: "20px",
    alignItems: "start",
  },
  tree: { position: { default: "sticky", "@media (max-width: 860px)": "static" }, top: "68px" },
  node: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    paddingBlock: "4px",
    paddingRight: "8px",
    borderRadius: "6px",
    fontSize: "13px",
    color: "var(--mantine-color-gray-8)",
    ":hover": { backgroundColor: "var(--mantine-color-gray-1)" },
  },
  nodeSelected: { backgroundColor: "var(--mantine-color-taste-0)", color: "var(--mantine-color-taste-9)" },
  container: { color: "var(--mantine-color-gray-6)", cursor: "default", ":hover": { backgroundColor: "transparent" } },
  nodeLabel: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  count: { fontSize: "11px", color: "var(--mantine-color-gray-6)", fontVariantNumeric: "tabular-nums" },
  unmatched: { color: "var(--mantine-color-orange-6)", flexShrink: 0 },
  section: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--mantine-color-gray-6)",
    paddingTop: "8px",
    paddingBottom: "2px",
  },
  probeRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.9fr) 16px minmax(0, 1.1fr) auto",
    columnGap: "8px",
    alignItems: "center",
    paddingBlock: "4px",
  },
  mono: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: "12px", wordBreak: "break-all" },
  numeric: { fontVariantNumeric: "tabular-nums" },
});

const totalOf = (counts: AuditPlacesResult["globalCounts"]) => counts.reduce((sum, entry) => sum + entry.count, 0);

function TreeNodes({
  nodes,
  depth,
  selected,
  onSelect,
  countsByPlace,
  unmatched,
}: {
  nodes: ReadonlyArray<PlaceTreeNode>;
  depth: number;
  selected: string | undefined;
  onSelect: (place: string) => void;
  countsByPlace: ReadonlyMap<string, number>;
  unmatched: ReadonlySet<string>;
}) {
  return nodes.map((node) => (
    <div key={node.place ?? node.label}>
      {node.place === undefined ? (
        <div {...stylex.props(styles.node, styles.container)} style={{ paddingLeft: 8 + depth * 14 }}>
          <PlaceFormIcon place={`${node.label}::`} />
          <Tooltip label="Only places inside this repo are in use" withArrow openDelay={400}>
            <span {...stylex.props(styles.nodeLabel)}>{node.label}</span>
          </Tooltip>
        </div>
      ) : (
        <UnstyledButton
          onClick={() => onSelect(node.place ?? "")}
          {...stylex.props(styles.node, selected === node.place && styles.nodeSelected)}
          style={{ paddingLeft: 8 + depth * 14 }}
          aria-current={selected === node.place}
        >
          <PlaceFormIcon place={node.place} />
          <span {...stylex.props(styles.nodeLabel)} title={node.place}>
            {node.label}
          </span>
          {unmatched.has(node.place) && (
            <Tooltip label="Unmatched by your probes" withArrow>
              <TriangleAlert size={12} {...stylex.props(styles.unmatched)} />
            </Tooltip>
          )}
          <span {...stylex.props(styles.count)}>{countsByPlace.get(node.place) ?? 0}</span>
        </UnstyledButton>
      )}
      {node.children.length > 0 && (
        <TreeNodes
          nodes={node.children}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
          countsByPlace={countsByPlace}
          unmatched={unmatched}
        />
      )}
    </div>
  ));
}

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

/** "Where am I?": one directory through the configured resolver, without touching the probes. */
function WhereAmI({ onKeep }: { onKeep: (directory: string) => void }) {
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string | undefined>(undefined);
  const resolved = useQuery(reviewContextQuery({ dir: asked }));
  const known = useKnownPlaces(resolved.data?.places ?? []);
  return (
    <Stack gap={6}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() !== "") setAsked(draft.trim());
        }}
      >
        <Group gap={6} wrap="nowrap">
          <TextInput
            size="xs"
            aria-label="Where am I? A directory to resolve"
            placeholder="Where am I? e.g. ~/code/acme-web/apps/checkout"
            leftSection={<LocateFixed size={13} />}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button size="xs" variant="default" type="submit" loading={resolved.isFetching}>
            Resolve
          </Button>
        </Group>
      </form>
      {asked !== undefined && resolved.error && (
        <Text size="xs" c="red.7" style={{ whiteSpace: "pre-wrap" }}>
          {resolved.error.message}
        </Text>
      )}
      {asked !== undefined && resolved.data !== undefined && (
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            {resolved.data.places.length === 0 ? "Unknown context: the resolver returned no places" : "Resolves to"}
          </Text>
          {resolved.data.places.map((place) => (
            <PlaceChip key={place} place={place} label={known.labelOf(place)} />
          ))}
          <Button size="compact-xs" variant="subtle" onClick={() => onKeep(asked)}>
            Add to probes
          </Button>
        </Group>
      )}
    </Stack>
  );
}

function TestBench({
  probes,
  setProbes,
  audit,
  known,
}: {
  probes: ReadonlyArray<string>;
  setProbes: (probes: ReadonlyArray<string>) => void;
  audit: AuditPlacesResult | undefined;
  known: KnownPlaces;
}) {
  const [draft, setDraft] = useState("");
  const add = (probe: string) => {
    const trimmed = probe.trim();
    if (trimmed !== "" && !probes.includes(trimmed)) setProbes([...probes, trimmed]);
  };
  const unmatchedCount = audit?.audit.unmatched.length ?? 0;
  return (
    <Paper p="sm">
      <Stack gap={8}>
        <Group justify="space-between">
          <Tooltip
            label="Directories you work in, or place keys. The audit flags accepted scope places none of them reach. Kept in this browser."
            withArrow
            multiline
            w={300}
            position="top-start"
          >
            <Text size="sm" fw={600} w="fit-content">
              Test these working locations
            </Text>
          </Tooltip>
          {probes.length > 0 && audit !== undefined && (
            <Text size="xs" c={unmatchedCount > 0 ? "orange.8" : "taste.8"}>
              {unmatchedCount === 0
                ? `Every accepted scope place is matched by ${probes.length === 1 ? "this probe" : `these ${probes.length} probes`}`
                : `${unmatchedCount} ${unmatchedCount === 1 ? "place" : "places"} unmatched by ${probes.length === 1 ? "this probe" : `these ${probes.length} probes`}`}
            </Text>
          )}
        </Group>
        {probes.length === 0 ? (
          <Text size="xs" c="dimmed">
            No probes yet. Add the directories you work in to see which scope places none of them reach.
          </Text>
        ) : (
          <div>
            {probes.map((probe) => {
              const resolution = audit?.audit.probes.find(
                (entry) => entry.probe === probe || entry.places.includes(probe),
              );
              return (
                <div key={probe} {...stylex.props(styles.probeRow)}>
                  <Text {...stylex.props(styles.mono)}>{probe}</Text>
                  <ArrowRight size={12} color="var(--mantine-color-gray-5)" />
                  <Group gap={4}>
                    {resolution === undefined ? (
                      <Text size="xs" c="dimmed">
                        …
                      </Text>
                    ) : resolution.places.length === 0 ? (
                      <Text size="xs" c="orange.8">
                        No places (unknown context)
                      </Text>
                    ) : (
                      resolution.places.map((place) => (
                        <PlaceChip key={place} place={place} label={known.labelOf(place)} />
                      ))
                    )}
                  </Group>
                  <Tooltip label="Remove this probe" withArrow>
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
                </div>
              );
            })}
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            add(draft);
            setDraft("");
          }}
        >
          <Group gap={6} wrap="nowrap">
            <TextInput
              size="xs"
              aria-label="Add a working location"
              placeholder="A directory (~/code/acme-web) or a place key"
              leftSection={<Plus size={13} />}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button size="xs" variant="default" type="submit" disabled={draft.trim() === ""}>
              Add probe
            </Button>
          </Group>
        </form>
        <WhereAmI onKeep={add} />
      </Stack>
    </Paper>
  );
}

function RepointSheet({
  from,
  opened,
  onClose,
  affected,
  known,
}: {
  from: PlaceKey;
  opened: boolean;
  onClose: () => void;
  affected: ReadonlyArray<DerivationRow>;
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
        <Stack gap={6}>
          <Text size="sm" fw={600}>
            {affected.length === 0
              ? "Nothing accepted is scoped to exactly this place"
              : `${affected.length} accepted ${affected.length === 1 ? "item" : "items"} would get a revision`}
          </Text>
          {affected.map((row) => {
            const others = scopePlacesOf(row.effectiveScope).filter((place) => place !== from);
            return (
              <Stack key={row.id} gap={2}>
                <DerivationSummaryLine summary={row} />
                {others.length > 0 && (
                  <Group gap={4} pl={18}>
                    <Text size="xs" c="dimmed">
                      Keeps
                    </Text>
                    {others.map((place) => (
                      <PlaceChip key={place} place={place} label={known.labelOf(place)} />
                    ))}
                  </Group>
                )}
              </Stack>
            );
          })}
        </Stack>
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
            disabled={target === undefined || target === from || affected.length === 0}
            loading={repoint.isPending}
            onClick={() => target !== undefined && repoint.mutate(target)}
          >
            Create {affected.length} scope-change {affected.length === 1 ? "proposal" : "proposals"}
          </Button>
        )}
      </Stack>
    </Drawer>
  );
}

function PlaceDetails({
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
  if (place === GLOBAL_NODE) {
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
      <RepointSheet
        from={place}
        opened={repointing}
        onClose={() => setRepointing(false)}
        affected={acceptedHere}
        known={known}
      />
    </Stack>
  );
}

/** The top place in tree order, so the details pane opens on the row the reviewer sees first. */
const firstPlaceShown = (nodes: ReadonlyArray<PlaceTreeNode>): string | undefined => {
  for (const node of nodes) {
    const found = node.place ?? firstPlaceShown(node.children);
    if (found !== undefined) return found;
  }
  return undefined;
};

function PlacesScreen() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [probes, setProbes] = useLocalStorage<ReadonlyArray<string>>({ key: PROBES_STORAGE_KEY, defaultValue: [] });
  const audit = useQuery(placesAuditQuery(probes));
  const known = useKnownPlaces();
  const [needle, setNeedle] = useState("");
  const data = audit.data;
  const places = (data?.places ?? []).map((entry) => entry.place);
  const tree = buildPlaceTree(places, known.labelOf);
  const countsByPlace = new Map((data?.places ?? []).map((entry) => [entry.place, totalOf(entry.counts)]));
  const unmatched = new Set(probes.length === 0 ? [] : (data?.audit.unmatched ?? []).map((entry) => entry.place));
  const selected = search.place ?? firstPlaceShown([...tree.repos, ...tree.directories, ...tree.named]);
  const select = (place: string) => void navigate({ search: { place }, replace: true });
  const sections: Array<[string, ReadonlyArray<PlaceTreeNode>]> = [
    ["Repos", filterPlaceTree(tree.repos, needle)],
    ["Directories", filterPlaceTree(tree.directories, needle)],
    ["Named places", filterPlaceTree(tree.named, needle)],
  ];

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Title order={3}>Places</Title>
        <Text size="xs" c="dimmed">
          Every place a scope names, how much lives there, and whether the places you work in still reach it.
        </Text>
      </Stack>
      <TestBench probes={probes} setProbes={setProbes} audit={data} known={known} />
      {audit.error ? (
        <QueryErrorAlert error={audit.error} />
      ) : data === undefined ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <div {...stylex.props(styles.layout)}>
          <Paper p="xs" {...stylex.props(styles.tree)}>
            <TextInput
              size="xs"
              aria-label="Search places"
              placeholder="Search places"
              leftSection={<Search size={13} />}
              value={needle}
              onChange={(event) => setNeedle(event.currentTarget.value)}
              mb={4}
            />
            <ScrollArea.Autosize mah="calc(100vh - 220px)">
              {totalOf(data.globalCounts) > 0 && (
                <UnstyledButton
                  onClick={() => select(GLOBAL_NODE)}
                  {...stylex.props(styles.node, selected === GLOBAL_NODE && styles.nodeSelected)}
                  style={{ paddingLeft: 8 }}
                >
                  <Globe size={12} color="var(--mantine-color-orange-6)" />
                  <span {...stylex.props(styles.nodeLabel)}>Everywhere</span>
                  <span {...stylex.props(styles.count)}>{totalOf(data.globalCounts)}</span>
                </UnstyledButton>
              )}
              {sections.map(([title, nodes]) =>
                nodes.length === 0 ? null : (
                  <div key={title}>
                    <div {...stylex.props(styles.section)} style={{ paddingLeft: 8 }}>
                      {title}
                    </div>
                    <TreeNodes
                      nodes={nodes}
                      depth={0}
                      selected={selected}
                      onSelect={select}
                      countsByPlace={countsByPlace}
                      unmatched={unmatched}
                    />
                  </div>
                ),
              )}
              {places.length === 0 && (
                <Text size="xs" c="dimmed" p="xs">
                  No scope names a place yet.
                </Text>
              )}
            </ScrollArea.Autosize>
          </Paper>
          <Paper p="md">
            {selected === undefined ? (
              <Text c="dimmed">Pick a place.</Text>
            ) : (
              <PlaceDetails key={selected} place={selected} audit={data} probes={probes} known={known} />
            )}
          </Paper>
        </div>
      )}
    </Stack>
  );
}
