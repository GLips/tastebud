import { Badge, Text } from "@mantine/core";

/**
 * A count beside a tab, section or nav entry. `attention` (filled green) is for work waiting on the owner, like
 * the Inbox; everything else is quiet gray. Zero is plain dimmed text, never an empty-looking chip.
 */
export function CountBadge({ count, tone = "quiet" }: { count: number; tone?: "quiet" | "attention" }) {
  if (count === 0)
    return (
      <Text span size="xs" c="dimmed">
        0
      </Text>
    );
  return (
    <Badge
      size="sm"
      circle={count < 10}
      variant={tone === "attention" ? "filled" : "light"}
      color={tone === "attention" ? "tastebud" : "gray"}
    >
      {count}
    </Badge>
  );
}
