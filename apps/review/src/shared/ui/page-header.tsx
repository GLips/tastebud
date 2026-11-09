import { Group, Stack, Title } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * Every page's header: a crumb back to where it sits, its name, and its controls. No sentence under the
 * title: the page's structure (columns, groups, labelled properties) says what it is for.
 */
export function ReviewPageHeader({
  title,
  icon,
  crumb,
  actions,
}: {
  title: ReactNode;
  /** Sits before the title, such as a kind's glyph. */
  icon?: ReactNode;
  /** A link back up, above the title, on detail pages. */
  crumb?: ReactNode;
  /** Controls aligned to the header's right edge. */
  actions?: ReactNode;
}) {
  return (
    <Stack gap="2xs" component="header">
      {crumb}
      <Group justify="space-between" align="center" wrap="nowrap" gap="md">
        <Group gap="xs" wrap="nowrap">
          {icon}
          <Title order={3}>{title}</Title>
        </Group>
        {actions}
      </Group>
    </Stack>
  );
}
