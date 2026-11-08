/** Recall with no prompt: everything agents can be told where the inspector stands, by kind, and the no's they hear. */
import { Box, Stack, Text } from "@mantine/core";

import { capitalize, describeKindDelivery } from "#review/shared/ui/kind-identity.tsx";

import type { RecallAppliesHere } from "./recall-applies.ts";
import { RecallItemRow } from "./recall-item-row.tsx";

export function RecallAppliesPanel({
  applies,
  hookLimit,
  nowhere,
}: {
  applies: RecallAppliesHere;
  hookLimit: number;
  /** Standing nowhere in particular: only global items reach. */
  nowhere: boolean;
}) {
  const total = applies.byKind.reduce((sum, group) => sum + group.accepted.length, 0);
  return (
    <Stack gap="lg">
      <Text size="sm">
        {total === 0
          ? "Nothing you've accepted reaches agents here."
          : `${total} accepted ${total === 1 ? "item reaches" : "items reach"} agents ${nowhere ? "even nowhere in particular, because they apply everywhere" : "here"}. Type a prompt to see which of them an agent would get for it.`}
      </Text>
      {applies.byKind.map(({ kind, accepted }) => (
        <Stack key={kind.key} gap="2xs">
          <Stack gap="3xs">
            <Text size="sm" fw={600}>
              {capitalize(kind.plural)}{" "}
              <Text span size="xs" c="dimmed" fw={400}>
                {accepted.length}
              </Text>
            </Text>
            <Text size="xs" c="dimmed">
              {describeKindDelivery(kind)}
              {kind.recall === "inject" && ` At most ${hookLimit} go with one prompt.`}
            </Text>
          </Stack>
          <Box>
            {accepted.map((item) => (
              <RecallItemRow key={item.id} item={item} />
            ))}
          </Box>
        </Stack>
      ))}
      {applies.rejected.length > 0 && (
        <Stack gap="2xs">
          <Stack gap="3xs">
            <Text size="sm" fw={600}>
              You said no{" "}
              <Text span size="xs" c="dimmed" fw={400}>
                {applies.rejected.length}
              </Text>
            </Text>
            <Text size="xs" c="dimmed">
              Rejected here. When an agent asks about matching words it is told you said no, so it doesn't propose them
              again.
            </Text>
          </Stack>
          <Box>
            {applies.rejected.map((item) => (
              <RecallItemRow
                key={item.id}
                item={item}
                {...(item.reason !== undefined && { reason: `“${item.reason}”` })}
              />
            ))}
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
