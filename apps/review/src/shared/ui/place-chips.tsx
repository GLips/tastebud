/**
 * Places and scopes as the reviewer reads them: a chip per place with an icon for its form, the
 * short label, and the full key one hover away. Global is always the orange chip, because it is the
 * scope that is easiest to approve by accident. Every chip opens its place on the Places page,
 * except where the chip is part of an editor and leaving would drop the draft.
 */
import { Badge, CopyButton, Group, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { type DerivationScope, formatPlaceLabel, parsePlaceKey, type PlaceKey } from "@tastebud/core/places";
import { Result } from "effect";
import { Check, Copy, Folder, FolderGit2, Globe, type LucideIcon, Tag } from "lucide-react";

import { GLOBAL_PLACE_NODE } from "#review/shared/known-place-labels.ts";

import { BadgeLink } from "./router-links.tsx";

export type PlaceForm = "repo" | "directory" | "named";

export const placeFormOf = (place: PlaceKey): PlaceForm => {
  const parsed = parsePlaceKey(place);
  return Result.isSuccess(parsed) ? parsed.success.form : "named";
};

const PLACE_FORM_ICONS: Record<PlaceForm, LucideIcon> = { repo: FolderGit2, directory: Folder, named: Tag };
export const PLACE_FORM_NAMES: Record<PlaceForm, string> = {
  repo: "Repo place",
  directory: "Directory place",
  named: "Named place",
};

export function PlaceFormIcon({ place, size = 12 }: { place: PlaceKey; size?: number }) {
  const Icon = PLACE_FORM_ICONS[placeFormOf(place)];
  return <Icon size={size} strokeWidth={2} aria-hidden {...stylex.props(styles.formIcon)} />;
}

const styles = stylex.create({
  formIcon: { flexShrink: 0 },
  key: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: "11px", wordBreak: "break-all" },
  copyable: { cursor: "copy", userSelect: "all" },
  // Quiet until pointed at: the chip reads as a label, and only hover or focus shows it leads somewhere.
  linked: {
    cursor: "pointer",
    textDecorationLine: { default: "none", ":hover": "underline", ":focus-visible": "underline" },
    textUnderlineOffset: "2px",
    outline: { default: "none", ":focus-visible": "2px solid var(--mantine-color-tastebud-5)" },
    outlineOffset: "1px",
  },
});

// Mantine clips badge labels with an ellipsis, which lets a table column squeeze a place to "ac…".
const UNCLIPPED_LABEL = { label: { overflow: "visible" } };

export function PlaceChip({
  place,
  label,
  color = "gray",
  strike = false,
  linked = true,
}: {
  place: PlaceKey;
  label?: string;
  color?: string;
  strike?: boolean;
  /** Off inside editors, where the chip is part of a draft and following it would drop the draft. */
  linked?: boolean;
}) {
  const badge = {
    color,
    size: "md",
    variant: "light",
    tt: "none",
    fw: 500,
    styles: UNCLIPPED_LABEL,
    leftSection: <PlaceFormIcon place={place} size={11} />,
    children: label ?? formatPlaceLabel(place),
  } as const;
  return (
    <Tooltip
      label={
        <span>
          {PLACE_FORM_NAMES[placeFormOf(place)]} · <span {...stylex.props(styles.key)}>{place}</span>
        </span>
      }
      withArrow
      openDelay={250}
    >
      {linked ? (
        <BadgeLink to="/places" search={{ place }} {...badge} {...stylex.props(styles.linked)} />
      ) : (
        <Badge {...badge} td={strike ? "line-through" : undefined} />
      )}
    </Tooltip>
  );
}

function GlobalScopeChip({ label = "Everywhere", linked }: { label?: string; linked: boolean }) {
  const badge = {
    color: "orange",
    size: "md",
    variant: "light",
    tt: "none",
    styles: UNCLIPPED_LABEL,
    leftSection: <Globe size={11} strokeWidth={2.25} />,
    children: label,
  } as const;
  return (
    <Tooltip label="Global: applies in every place, including future ones" withArrow>
      {linked ? (
        <BadgeLink to="/places" search={{ place: GLOBAL_PLACE_NODE }} {...badge} {...stylex.props(styles.linked)} />
      ) : (
        <Badge {...badge} />
      )}
    </Tooltip>
  );
}

export function ScopeChips({
  scope,
  labels,
  wrap = "nowrap",
  linked = true,
}: {
  scope: DerivationScope;
  labels?: ReadonlyMap<PlaceKey, string>;
  wrap?: "wrap" | "nowrap";
  linked?: boolean;
}) {
  if (scope.scope === "global") return <GlobalScopeChip linked={linked} />;
  return (
    <Group gap="2xs" wrap={wrap}>
      {scope.places.map((place) => {
        const label = labels?.get(place);
        return <PlaceChip key={place} place={place} linked={linked} {...(label !== undefined && { label })} />;
      })}
    </Group>
  );
}

/** A full place key in monospace that copies on click; it is what the CLI's `--place` takes. */
export function PlaceKeyCopy({ place }: { place: PlaceKey }) {
  return (
    <CopyButton value={place}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Copied" : "Copy the full key"} withArrow openDelay={300}>
          <Group gap="2xs" wrap="nowrap" onClick={copy} {...stylex.props(styles.copyable)}>
            <Text span c="dimmed" {...stylex.props(styles.key)}>
              {place}
            </Text>
            {copied ? (
              <Check size={11} color="var(--mantine-color-tastebud-7)" />
            ) : (
              <Copy size={11} color="var(--mantine-color-gray-5)" />
            )}
          </Group>
        </Tooltip>
      )}
    </CopyButton>
  );
}
