import {
  ActionIcon,
  Badge,
  Button,
  createTheme,
  type MantineColorsTuple,
  Paper,
  rem,
  Text,
  Tooltip,
} from "@mantine/core";

// The logo's green, as a Mantine ramp: shade 6 is the mark itself (#3BB273).
const tasteGreen: MantineColorsTuple = [
  "#e9f8f0",
  "#d6efe2",
  "#aedcc4",
  "#83c9a4",
  "#5fba89",
  "#47b078",
  "#3bb273",
  "#2c9560",
  "#228454",
  "#107345",
];

/**
 * The spacing steps, in px, that layouts may use: Mantine's named sizes plus the tight steps the dense
 * review tables need. The structural lint reads this literal to check spacing values against it.
 * @public
 */
export const spacing = { "3xs": 2, "2xs": 4, xxs: 6, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 } as const;

/**
 * Corner radii, in px; read by the structural lint like `spacing`.
 * @public
 */
export const radius = { xs: 2, sm: 4, md: 8, lg: 12, xl: 16 } as const;

/**
 * The type scale beyond Mantine's xs–xl (12–20px), applied with `fz`: ids and counts, the place tree's
 * labels, and the statement and quote sizes each screen leads with.
 */
const reviewFontSizes = {
  "2xs": rem(11),
  treeLabel: rem(13),
  cardStatement: rem(15),
  sourceQuote: rem(19),
  pageStatement: rem(22),
};

/**
 * Every shadow the review UI draws, applied by name through a component's `shadow` prop. Both are
 * 3px rings: one marks the selected Inbox card, one a thread listener that is live.
 */
const reviewShadows = {
  selectedCard: "0 0 0 3px var(--mantine-color-taste-1)",
  listeningDot: "0 0 0 3px var(--mantine-color-teal-1)",
};

const remScale = (scale: Readonly<Record<string, number>>): Record<string, string> =>
  Object.fromEntries(Object.entries(scale).map(([name, px]) => [name, rem(px)]));

/** A quiet, light reviewing tool: neutral ground, the logo's green as the one accent, colour reserved for state. */
export const tasteMantineTheme = createTheme({
  primaryColor: "taste",
  colors: { taste: tasteGreen },
  primaryShade: { light: 7, dark: 5 },
  spacing: remScale(spacing),
  radius: remScale(radius),
  shadows: reviewShadows,
  fontSizes: reviewFontSizes,
  defaultRadius: "md",
  cursorType: "pointer",
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  fontFamilyMonospace: 'ui-monospace, "SF Mono", Menlo, monospace',
  headings: { fontWeight: "650" },
  components: {
    Button: Button.extend({ defaultProps: { size: "xs" } }),
    ActionIcon: ActionIcon.extend({ defaultProps: { radius: "md" } }),
    Badge: Badge.extend({ defaultProps: { radius: "sm", variant: "light", size: "sm" } }),
    Text: Text.extend({ defaultProps: { size: "sm" } }),
    Paper: Paper.extend({ defaultProps: { withBorder: true, radius: "md" } }),
    Tooltip: Tooltip.extend({ defaultProps: { openDelay: 250, fz: "xs" } }),
  },
});
