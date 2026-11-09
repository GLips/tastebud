import { Badge, Tooltip } from "@mantine/core";
import { Ban, Contrast, CopyCheck, type LucideIcon } from "lucide-react";

/** Something worth reading before a decision: a source or derivation says the opposite, or it is near one. */
export type DerivationCaution = "says-the-opposite" | "near-a-rejection" | "near-a-repeat";

// Opposition is red, nearness orange, in the inbox row, the pane and the page alike.
const CAUTION_TONES: Record<DerivationCaution, { word: string; color: string; icon: LucideIcon; about: string }> = {
  "says-the-opposite": {
    word: "Says the opposite",
    color: "red",
    icon: Contrast,
    about: "One of its sources, or another derivation, says the opposite",
  },
  "near-a-rejection": {
    word: "Near a rejection",
    color: "orange",
    icon: Ban,
    about: "Close to something you rejected",
  },
  "near-a-repeat": {
    word: "Near repeat",
    color: "orange",
    icon: CopyCheck,
    about: "Overlaps a near repeat already decided",
  },
};

/** A caution as one chip, with its own words, colour and icon; `about` replaces the default tooltip. */
export function CautionChip({ caution, about }: { caution: DerivationCaution; about?: string }) {
  const { word, color, icon: Icon, about: defaultAbout } = CAUTION_TONES[caution];
  return (
    <Tooltip label={about ?? defaultAbout} withArrow openDelay={250}>
      <Badge color={color} leftSection={<Icon size={11} strokeWidth={2} aria-hidden />}>
        {word}
      </Badge>
    </Tooltip>
  );
}
