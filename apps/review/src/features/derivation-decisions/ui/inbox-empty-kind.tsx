/** A kind with nothing waiting: the way to whichever kinds still have something, or how proposals arrive. */
import { Button, Center, Group, Stack, Text } from "@mantine/core";
import { PartyPopper } from "lucide-react";

import { KindGlyph } from "#review/shared/ui/kind-identity.tsx";
import { AnchorLink } from "#review/shared/ui/router-links.tsx";
import { SupportingText } from "#review/shared/ui/supporting-text.tsx";

import type { InboxKindsProps } from "./inbox-kind-tabs.tsx";

export function InboxEmptyKind({ catalog, kinds, kind, pendingByKind, onShowKind }: InboxKindsProps) {
  const othersWaiting = kinds.filter((other) => other.key !== kind.key && (pendingByKind.get(other.key) ?? 0) > 0);
  return (
    <Center py={64}>
      <Stack align="center" gap="xxs">
        <PartyPopper size={28} color="var(--mantine-color-tastebud-6)" />
        <Text fw={600}>No {kind.plural} waiting</Text>
        {othersWaiting.length > 0 ? (
          <Group gap="xxs" mt="2xs">
            {othersWaiting.map((other) => {
              const count = pendingByKind.get(other.key) ?? 0;
              return (
                <Button
                  key={other.key}
                  size="xs"
                  variant="default"
                  leftSection={<KindGlyph catalog={catalog} kind={other.key} />}
                  onClick={() => onShowKind(other.key)}
                >
                  Review {count} {count === 1 ? other.singular : other.plural}
                </Button>
              );
            })}
          </Group>
        ) : (
          <SupportingText tier="secondary">
            Agents propose with <code>tastebud propose</code>.{" "}
            <AnchorLink to="/kinds/$kind" params={{ kind: kind.key }}>
              Browse {kind.plural}
            </AnchorLink>
          </SupportingText>
        )}
      </Stack>
    </Center>
  );
}
