/**
 * Another derivation as a title-first row in a related list (Linear's sub-issues): its kind glyph, its
 * statement at full width, then trailing chips (how it relates, where it applies, its status) that wrap
 * under the statement only when it is long. The whole row opens it. A version stack sets `place`: the
 * derivation being read is the muted `current` row ("This one"), not a link, and later versions hang under it as
 * `child` rows on a connector rail. Rows divide themselves; put them in a bordered `Paper`.
 */
import { Box, Group, Stack, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { CatalogView } from "@tastebud/core/kind-catalog";
import type { PlaceKey } from "@tastebud/core/places";
import type { DerivationSummary } from "@tastebud/core/record-views";
import type { ReactNode } from "react";

import { KindGlyph } from "./kind-identity.tsx";
import { ScopeChips } from "./place-chips.tsx";
import { AnchorLink } from "./router-links.tsx";
import { DerivationStatusBadge } from "./status-chips.tsx";

const styles = stylex.create({
  row: {
    display: "block",
    paddingBlock: "8px",
    paddingInline: "12px",
    borderTopWidth: { default: "1px", ":first-child": "0" },
    borderTopStyle: "solid",
    borderTopColor: "var(--mantine-color-gray-2)",
    color: "inherit",
    textDecoration: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--mantine-color-gray-0)",
      ":focus-visible": "var(--mantine-color-gray-0)",
    },
  },
  current: { backgroundColor: "var(--mantine-color-gray-0)" },
  // The connector: children sit right of a line that drops from the parent's glyph, with no dividers
  // between them so the line runs unbroken.
  child: {
    marginLeft: "18px",
    paddingLeft: "14px",
    borderTopWidth: "0",
    borderLeftWidth: "1px",
    borderLeftStyle: "solid",
    borderLeftColor: "var(--mantine-color-gray-3)",
  },
  line: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: "8px", rowGap: "4px" },
  // Sized to the statement, so a short one keeps the trailing chips beside it; a long one takes the
  // line and the chips wrap under it.
  title: { flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "baseline", gap: "8px" },
  trailing: { marginLeft: "auto" },
  quoted: { whiteSpace: "pre-wrap" },
});

/** Where a row sits in a version stack; `flat` for any other relation. */
export type DerivationRelationPlace = "flat" | "current" | "child";

export function DerivationRelationRow({
  summary,
  catalog,
  labels,
  place = "flat",
  tag,
  children,
}: {
  summary: DerivationSummary;
  /** Picks the kind's glyph; passed in so shared/ui never reads a feature's query. */
  catalog: CatalogView | undefined;
  labels: ReadonlyMap<PlaceKey, string>;
  place?: DerivationRelationPlace | undefined;
  /** How it relates, as the first trailing chip or word: a caution chip, "Builds on", "Supports". */
  tag?: ReactNode;
  /** A sub-line under the statement, such as the agent's case for asking again. */
  children?: ReactNode;
}) {
  const current = place === "current";
  const body = (
    <Stack gap="3xs">
      <Box {...stylex.props(styles.line)}>
        <Box {...stylex.props(styles.title)}>
          <KindGlyph catalog={catalog} kind={summary.kind} label={summary.kindLabel} size={10} />
          <Text size="sm" {...(current && { c: "dimmed" })} lineClamp={2}>
            {summary.statement}
          </Text>
        </Box>
        <Group gap="xs" wrap="nowrap" {...stylex.props(styles.trailing)}>
          {typeof tag === "string" ? (
            <Text size="xs" c="dimmed">
              {tag}
            </Text>
          ) : (
            tag
          )}
          <ScopeChips scope={summary.effectiveScope} labels={labels} linked={false} />
          <DerivationStatusBadge status={summary.status} />
        </Group>
      </Box>
      {summary.reason !== undefined && !current && (
        <Text size="xs" c="gray.7" {...stylex.props(styles.quoted)}>
          <Text span inherit c="dimmed">
            Reason{" "}
          </Text>
          “{summary.reason}”
        </Text>
      )}
      {children}
    </Stack>
  );
  if (current) return <Box {...stylex.props(styles.row, styles.current)}>{body}</Box>;
  return (
    <AnchorLink
      to="/derivations/$id"
      params={{ id: summary.id }}
      underline="never"
      {...stylex.props(styles.row, place === "child" && styles.child)}
    >
      {body}
    </AnchorLink>
  );
}
