import { type ElementProps, Text, type TextProps } from "@mantine/core";

/**
 * The two tiers of text under a page's main content:
 * - `secondary` (sm, gray.7): what a person reads to decide, such as provenance, reasons, delivery, origin
 *   and the dates a list is scanned by.
 * - `faint` (xs, dimmed): only timestamps and ids, which are looked up rather than read.
 */
type SupportingTextTier = "secondary" | "faint";

const TIER_TEXT = {
  secondary: { size: "sm", c: "gray.7" },
  faint: { size: "xs", c: "dimmed" },
} as const satisfies Record<SupportingTextTier, Pick<TextProps, "size" | "c">>;

type SupportingTextProps = Omit<TextProps, "size" | "fz" | "c" | "variant"> &
  ElementProps<"p", keyof TextProps> & { tier: SupportingTextTier };

/** Text in one of the review UI's two supporting tiers; size and colour come from the tier, never the caller. */
export function SupportingText({ tier, ...props }: SupportingTextProps) {
  return <Text {...props} {...TIER_TEXT[tier]} />;
}
