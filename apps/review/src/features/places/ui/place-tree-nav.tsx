/** The Places page's left column: a searchable tree of every place a scope names, with counts. */
import { Box, Paper, ScrollArea, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { AuditPlacesResult } from "@tastebud/core/places-audit";
import { Globe, Search, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { GLOBAL_PLACE_NODE } from "#review/shared/known-place-labels.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { PlaceFormIcon } from "#review/shared/ui/place-chips.tsx";

import { buildPlaceTree, filterPlaceTree, firstPlaceShown, type PlaceTreeNode, totalPlaceCount } from "./place-tree.ts";

const styles = stylex.create({
  indent: (depth: number) => ({ paddingLeft: `${8 + depth * 14}px` }),
  tree: { position: { default: "sticky", "@media (max-width: 860px)": "static" }, top: "68px" },
  node: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    paddingBlock: "4px",
    paddingRight: "8px",
    borderRadius: "6px",
    color: "var(--mantine-color-gray-8)",
    ":hover": { backgroundColor: "var(--mantine-color-gray-1)" },
  },
  nodeSelected: { backgroundColor: "var(--mantine-color-tastebud-0)", color: "var(--mantine-color-tastebud-9)" },
  container: { color: "var(--mantine-color-gray-6)", cursor: "default", ":hover": { backgroundColor: "transparent" } },
  nodeLabel: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  count: { color: "var(--mantine-color-gray-6)", fontVariantNumeric: "tabular-nums" },
  unmatched: { color: "var(--mantine-color-orange-6)", flexShrink: 0 },
  section: {
    fontWeight: 600,
    color: "var(--mantine-color-gray-6)",
    paddingTop: "8px",
    paddingBottom: "2px",
  },
});

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
    <Box key={node.place ?? node.label}>
      {node.place === undefined ? (
        <Box fz="treeLabel" {...stylex.props(styles.node, styles.container, styles.indent(depth))}>
          <PlaceFormIcon place={`${node.label}::`} />
          <Tooltip label="Only places inside this repo are in use" withArrow openDelay={400}>
            <Box component="span" {...stylex.props(styles.nodeLabel)}>
              {node.label}
            </Box>
          </Tooltip>
        </Box>
      ) : (
        <UnstyledButton
          onClick={() => onSelect(node.place ?? "")}
          fz="treeLabel"
          {...stylex.props(styles.node, selected === node.place && styles.nodeSelected, styles.indent(depth))}
          aria-current={selected === node.place}
        >
          <PlaceFormIcon place={node.place} />
          <Box component="span" {...stylex.props(styles.nodeLabel)} title={node.place}>
            {node.label}
          </Box>
          {unmatched.has(node.place) && (
            <Tooltip label="Unmatched by your probes" withArrow>
              <TriangleAlert size={12} {...stylex.props(styles.unmatched)} />
            </Tooltip>
          )}
          <Box component="span" fz="2xs" {...stylex.props(styles.count)}>
            {countsByPlace.get(node.place) ?? 0}
          </Box>
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
    </Box>
  ));
}

/** The place the details pane shows: the one in the URL, else the tree's first row. */
export const selectedPlaceOf = (
  requested: string | undefined,
  audit: AuditPlacesResult | undefined,
  known: KnownPlaces,
): string | undefined => {
  if (requested !== undefined) return requested;
  const tree = buildPlaceTree(
    (audit?.places ?? []).map((entry) => entry.place),
    known.labelOf,
  );
  return firstPlaceShown([...tree.repos, ...tree.directories, ...tree.named]);
};

export function PlaceTreeNav({
  audit,
  probed,
  selected,
  onSelect,
  known,
}: {
  audit: AuditPlacesResult;
  /** Whether any probes are set; without them nothing can be unmatched. */
  probed: boolean;
  selected: string | undefined;
  onSelect: (place: string) => void;
  known: KnownPlaces;
}) {
  const [needle, setNeedle] = useState("");
  const places = audit.places.map((entry) => entry.place);
  const tree = buildPlaceTree(places, known.labelOf);
  const countsByPlace = new Map(audit.places.map((entry) => [entry.place, totalPlaceCount(entry.counts)]));
  const unmatched = new Set(probed ? audit.audit.unmatched.map((entry) => entry.place) : []);
  const globalCount = totalPlaceCount(audit.globalCounts);
  const sections: Array<[string, ReadonlyArray<PlaceTreeNode>]> = [
    ["Repos", filterPlaceTree(tree.repos, needle)],
    ["Directories", filterPlaceTree(tree.directories, needle)],
    ["Named places", filterPlaceTree(tree.named, needle)],
  ];
  return (
    <Paper p="xs" {...stylex.props(styles.tree)}>
      <TextInput
        size="xs"
        aria-label="Search places"
        placeholder="Search places"
        leftSection={<Search size={13} />}
        value={needle}
        onChange={(event) => setNeedle(event.currentTarget.value)}
        mb="2xs"
      />
      <ScrollArea.Autosize mah="calc(100vh - 220px)">
        {globalCount > 0 && (
          <UnstyledButton
            onClick={() => onSelect(GLOBAL_PLACE_NODE)}
            fz="treeLabel"
            {...stylex.props(styles.node, selected === GLOBAL_PLACE_NODE && styles.nodeSelected, styles.indent(0))}
          >
            <Globe size={12} color="var(--mantine-color-orange-6)" />
            <Box component="span" {...stylex.props(styles.nodeLabel)}>
              Everywhere
            </Box>
            <Box component="span" fz="2xs" {...stylex.props(styles.count)}>
              {globalCount}
            </Box>
          </UnstyledButton>
        )}
        {sections.map(([title, nodes]) =>
          nodes.length === 0 ? null : (
            <Box key={title}>
              <Box fz="xs" {...stylex.props(styles.section, styles.indent(0))}>
                {title}
              </Box>
              <TreeNodes
                nodes={nodes}
                depth={0}
                selected={selected}
                onSelect={onSelect}
                countsByPlace={countsByPlace}
                unmatched={unmatched}
              />
            </Box>
          ),
        )}
        {places.length === 0 && (
          <Text size="xs" c="dimmed" p="xs">
            No scope names a place yet.
          </Text>
        )}
      </ScrollArea.Autosize>
    </Paper>
  );
}
