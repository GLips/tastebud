import { Collapse, Group, Stack, UnstyledButton } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

import { SupportingText } from "./supporting-text.tsx";

const styles = stylex.create({
  chevron: { transitionProperty: "transform", transitionDuration: "120ms" },
  chevronOpen: { transform: "rotate(90deg)" },
});

/**
 * Something rarely needed, folded under a quiet label: a chevron that turns as it opens, the label, and the
 * content beneath. Closed at first. Table rows that expand in place are their own pattern, not this.
 */
export function InlineDisclosure({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="2xs">
      <UnstyledButton onClick={() => setOpen(!open)} aria-expanded={open} w="fit-content">
        <Group gap="2xs" wrap="nowrap">
          <ChevronRight
            size={12}
            color="var(--mantine-color-gray-6)"
            aria-hidden
            {...stylex.props(styles.chevron, open && styles.chevronOpen)}
          />
          <SupportingText tier="secondary">{label}</SupportingText>
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>{children}</Collapse>
    </Stack>
  );
}
