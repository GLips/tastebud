import { Avatar, Group, Text } from "@mantine/core";
import type { SourceRecord } from "@tastebud/core/records";

import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

/**
 * Who said some words, as an initial and a name. The owner's own words get a filled brand avatar and read "You",
 * so they stand apart from what others said on a call or in a thread.
 */
export function SourceSpeaker({ source, owner }: { source: SourceRecord; owner: string | undefined }) {
  const own = source.said_by === owner;
  return (
    <Group gap="xs" wrap="nowrap">
      <Avatar size="sm" radius="xl" variant={own ? "filled" : "light"} color={own ? "tastebud" : "gray"} aria-hidden>
        {source.said_by_label.slice(0, 1).toUpperCase()}
      </Avatar>
      {own ? (
        <Text size="sm" fw={500}>
          You
        </Text>
      ) : (
        <SupportingText tier="secondary">{source.said_by_label}</SupportingText>
      )}
    </Group>
  );
}
