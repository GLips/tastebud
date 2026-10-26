/** The Places page's left column: a searchable tree of every place a scope names, with counts. */
import { Paper, ScrollArea, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { AuditPlacesResult } from "@taste/core";
import { Globe, Search, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { PlaceFormIcon } from "../place-chips.tsx";
import type { KnownPlaces } from "../use-review-context.ts";
import {
  buildPlaceTree,
  filterPlaceTree,
  firstPlaceShown,
  GLOBAL_PLACE_NODE,
  type PlaceTreeNode,
  totalPlaceCount,
} from "./place-tree.ts";

const styles = stylex.create({
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
        mb={4}
      />
      <ScrollArea.Autosize mah="calc(100vh - 220px)">
        {globalCount > 0 && (
          <UnstyledButton
            onClick={() => onSelect(GLOBAL_PLACE_NODE)}
            {...stylex.props(styles.node, selected === GLOBAL_PLACE_NODE && styles.nodeSelected)}
            style={{ paddingLeft: 8 }}
          >
            <Globe size={12} color="var(--mantine-color-orange-6)" />
            <span {...stylex.props(styles.nodeLabel)}>Everywhere</span>
            <span {...stylex.props(styles.count)}>{globalCount}</span>
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
                onSelect={onSelect}
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
  );
}
