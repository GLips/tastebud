import { Text } from "@mantine/core";
import type { ReactNode } from "react";

/** One label-and-value pair; the caller's two-column grid lays the pairs out. */
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
