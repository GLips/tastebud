import { Box, Text } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

const styles = stylex.create({
  list: {
    display: "grid",
    gridTemplateColumns: "88px minmax(0, 1fr)",
    columnGap: "12px",
    rowGap: "10px",
    alignItems: "baseline",
  },
});

/** One label-and-value pair; the caller's two-column grid (or a `FactList`) lays the pairs out. */
export function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <div>{children}</div>
    </>
  );
}

/** A properties column, Linear-style: labels in one narrow column, values beside them. Holds `FactRow`s. */
export function FactList({ children }: { children: ReactNode }) {
  return <Box {...stylex.props(styles.list)}>{children}</Box>;
}
