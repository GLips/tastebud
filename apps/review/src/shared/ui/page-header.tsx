import { Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * Every page's header: a crumb back to where it sits, its name, and one plain sentence saying what the
 * page is for, where the eye lands first. `purpose` is required so no page ships without saying its job.
 */
export function ReviewPageHeader({
  title,
  purpose,
  icon,
  crumb,
  details,
  actions,
}: {
  title: ReactNode;
  /** One sentence: what this page is for and what you can do here. */
  purpose: ReactNode;
  /** Sits before the title, such as a kind's glyph. */
  icon?: ReactNode;
  /** A link back up, above the title, on detail pages. */
  crumb?: ReactNode;
  /** Quieter facts under the purpose: a kind's description, how it reaches agents. */
  details?: ReactNode;
  /** Controls aligned to the header's right edge. */
  actions?: ReactNode;
}) {
  return (
    <Stack gap="2xs" component="header">
      {crumb}
      <Group justify="space-between" align="flex-end" wrap="nowrap" gap="md">
        <Stack gap="3xs">
          <Group gap="xs" wrap="nowrap">
            {icon}
            <Title order={3}>{title}</Title>
          </Group>
          <Text size="sm" c="gray.7">
            {purpose}
          </Text>
          {details !== undefined && (
            <Text size="xs" c="dimmed">
              {details}
            </Text>
          )}
        </Stack>
        {actions}
      </Group>
    </Stack>
  );
}
