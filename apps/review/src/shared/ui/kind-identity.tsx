/**
 * How kinds look and read across the UI: a small glyph in a colour picked from the kind's position in
 * the catalog (so three kinds never collide), and the one line that says how a kind reaches agents.
 */
import { Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { CatalogView, DerivedKindView } from "@tastebud/core/kind-catalog";
import type { RecallPolicy } from "@tastebud/core/taste-vocabulary";
import { Diamond, Hexagon, type LucideIcon, Pentagon, Square, Triangle } from "lucide-react";

const styles = stylex.create({
  glyph: { flexShrink: 0 },
  tooltipTarget: { display: "inline-flex" },
});

// Shapes stay clear of the circle, which status dots own; colours stay clear of green, red, orange and blue.
const KIND_ACCENTS: ReadonlyArray<{ readonly icon: LucideIcon; readonly color: string }> = [
  { icon: Diamond, color: "violet" },
  { icon: Triangle, color: "cyan" },
  { icon: Square, color: "grape" },
  { icon: Hexagon, color: "indigo" },
  { icon: Pentagon, color: "pink" },
];

export interface KindAccent {
  readonly icon: LucideIcon;
  /** A Mantine colour name. */
  readonly color: string;
}

/** The kind's glyph and colour; retired kinds (not in the catalog) are grey squares. */
const kindAccentOf = (catalog: CatalogView | undefined, kind: string): KindAccent => {
  const index = catalog?.derivedKinds.findIndex((candidate) => candidate.key === kind) ?? -1;
  return index < 0 ? { icon: Square, color: "gray" } : (KIND_ACCENTS[index % KIND_ACCENTS.length] ?? KIND_ACCENTS[0]!);
};

export function KindGlyph({
  catalog,
  kind,
  size = 11,
  label,
}: {
  catalog: CatalogView | undefined;
  kind: string;
  size?: number;
  /** A tooltip; omit where the kind's name is already printed next to it. */
  label?: string;
}) {
  const accent = kindAccentOf(catalog, kind);
  const Icon = accent.icon;
  const glyph = (
    <Icon
      size={size}
      strokeWidth={2.5}
      color={`var(--mantine-color-${accent.color}-6)`}
      fill={`var(--mantine-color-${accent.color}-1)`}
      aria-hidden={label === undefined}
      aria-label={label}
      {...stylex.props(styles.glyph)}
    />
  );
  return label === undefined ? (
    glyph
  ) : (
    <Tooltip label={label} withArrow openDelay={200}>
      <span {...stylex.props(styles.tooltipTarget)}>{glyph}</span>
    </Tooltip>
  );
}

/**
 * The one wording of what a recall policy means, shared by every page that explains it (library,
 * Places, Recall, Settings), so the owner reads the same promise everywhere.
 */
const RECALL_POLICY_REACH: Record<RecallPolicy, string> = {
  inject: "are sent with a prompt whose words match, and agents can look them up",
  pull: "are given only when an agent asks about matching words",
  never: "are never shown to agents; they are your backlog",
};

/** One sentence on how accepted derivations of a kind reach agents, from its policy alone. */
export const describeKindDelivery = (kind: Pick<DerivedKindView, "plural" | "recall">): string =>
  `Accepted ${kind.plural} ${RECALL_POLICY_REACH[kind.recall]}.`;

/** The policy as a short phrase for badges, in the owner's words rather than the config's. */
export const RECALL_POLICY_LABELS: Record<RecallPolicy, string> = {
  inject: "Sent with prompts",
  pull: "Given when asked",
  never: "Never shown to agents",
};

/** `Beliefs`, from `beliefs`. */
export const capitalize = (text: string): string => (text === "" ? text : text[0]!.toUpperCase() + text.slice(1));

export const findKindView = (catalog: CatalogView | undefined, kind: string): DerivedKindView | undefined =>
  catalog?.derivedKinds.find((candidate) => candidate.key === kind);
