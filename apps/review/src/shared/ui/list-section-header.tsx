/**
 * The header over one section of a grouped list: an optional leading mark, the title, its count and any
 * trailing chip, with a chevron when the section folds. The inbox queue, the library and Sources tables and
 * Recall's panel all head their sections with it, so a section reads the same on every page. Folding is
 * optional because only the tables fold; the frame fits the container the section lives in.
 */
import { Box, Group, Table, Text, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { CountBadge } from "./count-badge.tsx";

const styles = stylex.create({
  tint: { backgroundColor: "var(--mantine-color-gray-0)" },
  sticky: { position: "sticky", top: "var(--review-shell-header-height)", zIndex: 5 },
  ruled: { borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "var(--mantine-color-gray-2)" },
  toggle: { width: "100%" },
});

/** What the header sits in: a table's full-width row, a tinted band in a list, or plain over its rows. */
export type ListSectionHeaderFrame =
  | { readonly kind: "table-row"; readonly columns: number }
  | {
      readonly kind: "band";
      /** Stays under the shell header while its rows scroll past. */
      readonly sticky: boolean;
      /** A hairline above, for every section but the list's first. */
      readonly ruled: boolean;
    }
  | { readonly kind: "heading" };

export function ListSectionHeader({
  title,
  count,
  leading,
  trailing,
  fold,
  frame,
}: {
  /** A string reads as the section's name; a node brings its own (the inbox's place names with their icons). */
  title: ReactNode;
  /** Left out where a section has nothing to count. */
  count?: number | undefined;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Present when the section folds: the whole header is then its toggle. */
  fold?: { readonly open: boolean; readonly onToggle: () => void } | undefined;
  frame: ListSectionHeaderFrame;
}) {
  const Chevron = fold?.open === false ? ChevronRight : ChevronDown;
  const line = (
    <Group gap="xs">
      {fold !== undefined && <Chevron size={14} color="var(--mantine-color-gray-6)" aria-hidden />}
      {leading}
      {typeof title === "string" ? (
        <Text size="sm" fw={600}>
          {title}
        </Text>
      ) : (
        title
      )}
      {count !== undefined && <CountBadge count={count} />}
      {trailing}
    </Group>
  );
  const body =
    fold === undefined ? (
      line
    ) : (
      <UnstyledButton onClick={fold.onToggle} aria-expanded={fold.open} {...stylex.props(styles.toggle)}>
        {line}
      </UnstyledButton>
    );
  if (frame.kind === "table-row")
    return (
      <Table.Tr {...stylex.props(styles.tint)}>
        <Table.Td colSpan={frame.columns} py="xs" px="sm">
          {body}
        </Table.Td>
      </Table.Tr>
    );
  if (frame.kind === "band")
    return (
      <Box py="xs" px="sm" {...stylex.props(styles.tint, frame.sticky && styles.sticky, frame.ruled && styles.ruled)}>
        {body}
      </Box>
    );
  return body;
}
