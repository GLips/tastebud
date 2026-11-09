/** The Places page's left column: a searchable tree of every place a scope names, with counts. */
import { Box, Button, Group, Paper, ScrollArea, Text, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { AuditPlacesResult } from "@tastebud/core/places-audit";
import { Globe, Info, LocateFixed, Search, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { GLOBAL_PLACE_NODE } from "#review/shared/known-place-labels.ts";
import type { KnownPlaces } from "#review/shared/known-places.ts";
import { PlaceFormIcon } from "#review/shared/ui/place-chips.tsx";

import { buildPlaceTree, filterPlaceTree, firstPlaceShown, type PlaceTreeNode, totalPlaceCount } from "./place-tree.ts";

const styles = stylex.create({
  indent: (depth: number) => ({ paddingLeft: `${8 + depth * 14}px` }),
  tree: {
    position: { default: "sticky", "@media (max-width: 860px)": "static" },
    top: "calc(var(--review-shell-header-height) + var(--mantine-spacing-md))",
  },
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
  sectionInfo: { color: "var(--mantine-color-gray-5)", flexShrink: 0 },
  section: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
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
            <Tooltip label="None of your checked folders reach it" withArrow>
              <TriangleAlert size={12} {...stylex.props(styles.unmatched)} />
            </Tooltip>
          )}
          <Box
            component="span"
            fz="2xs"
            title={`${countsByPlace.get(node.place) ?? 0} scoped here, in any status`}
            {...stylex.props(styles.count)}
          >
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

/**
 * A named place is a scope that isn't a folder: an agent with no working folder, such as a chat app,
 * names it instead. Shown as the section's tooltip, since the term is Tastebud's own.
 */
const NAMED_PLACE_MEANING =
  "A name for work that isn't a folder, like a client (clients/acme). Agents with no folder, such as a chat app, name it.";

interface NavSection {
  readonly title: string;
  readonly nodes: ReadonlyArray<PlaceTreeNode>;
  readonly about?: string;
  /** What an empty section says; a section without one hides when empty. */
  readonly empty?: string | undefined;
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
  testing,
  onTestPath,
}: {
  audit: AuditPlacesResult;
  /** Whether any probes are set; without them nothing can be unmatched. */
  probed: boolean;
  selected: string | undefined;
  onSelect: (place: string) => void;
  known: KnownPlaces;
  /** Whether Test a path is open in the details pane. */
  testing: boolean;
  onTestPath: () => void;
}) {
  const [needle, setNeedle] = useState("");
  const places = audit.places.map((entry) => entry.place);
  const tree = buildPlaceTree(places, known.labelOf);
  const countsByPlace = new Map(audit.places.map((entry) => [entry.place, totalPlaceCount(entry.counts)]));
  const unmatched = new Set(probed ? audit.audit.unmatched.map((entry) => entry.place) : []);
  const globalCount = totalPlaceCount(audit.globalCounts);
  const unreached = unmatched.size;
  const sections: ReadonlyArray<NavSection> = [
    { title: "Repos", nodes: filterPlaceTree(tree.repos, needle) },
    { title: "Directories", nodes: filterPlaceTree(tree.directories, needle) },
    {
      title: "Named places",
      nodes: filterPlaceTree(tree.named, needle),
      about: NAMED_PLACE_MEANING,
      empty: needle === "" ? "None yet" : undefined,
    },
  ];
  return (
    <Paper p="xs" {...stylex.props(styles.tree)}>
      <Group gap="xs" wrap="nowrap" mb="xs">
        <TextInput
          aria-label="Search places"
          placeholder="Search places"
          leftSection={<Search size={14} />}
          value={needle}
          onChange={(event) => setNeedle(event.currentTarget.value)}
          flex={1}
        />
        <Tooltip
          label={
            unreached > 0 ? `${unreached} with accepted items none of your kept paths reach` : "Which place a folder is"
          }
          withArrow
        >
          <Button
            variant={testing || unreached > 0 ? "light" : "default"}
            color={unreached > 0 ? "orange" : "tastebud"}
            leftSection={unreached > 0 ? <TriangleAlert size={14} /> : <LocateFixed size={14} />}
            onClick={onTestPath}
            aria-pressed={testing}
          >
            Test a path
          </Button>
        </Tooltip>
      </Group>
      <ScrollArea.Autosize mah="calc(100vh - 220px)">
        {globalCount > 0 && (
          <UnstyledButton
            onClick={() => onSelect(GLOBAL_PLACE_NODE)}
            fz="treeLabel"
            {...stylex.props(styles.node, selected === GLOBAL_PLACE_NODE && styles.nodeSelected, styles.indent(0))}
          >
            <Globe size={12} color="var(--mantine-color-gray-6)" />
            <Box component="span" {...stylex.props(styles.nodeLabel)}>
              Everywhere
            </Box>
            <Box
              component="span"
              fz="2xs"
              title={`${globalCount} scoped everywhere, in any status`}
              {...stylex.props(styles.count)}
            >
              {globalCount}
            </Box>
          </UnstyledButton>
        )}
        {sections.map(({ title, nodes, about, empty }) =>
          nodes.length === 0 && empty === undefined ? null : (
            <Box key={title}>
              <Box fz="xs" {...stylex.props(styles.section, styles.indent(0))}>
                {title}
                {about !== undefined && (
                  <Tooltip label={about} withArrow multiline maw={260}>
                    <Info
                      size={12}
                      aria-label={`What ${title.toLowerCase()} are`}
                      {...stylex.props(styles.sectionInfo)}
                    />
                  </Tooltip>
                )}
              </Box>
              {nodes.length === 0 ? (
                <Text size="xs" c="dimmed" {...stylex.props(styles.indent(0))}>
                  {empty}
                </Text>
              ) : (
                <TreeNodes
                  nodes={nodes}
                  depth={0}
                  selected={selected}
                  onSelect={onSelect}
                  countsByPlace={countsByPlace}
                  unmatched={unmatched}
                />
              )}
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
