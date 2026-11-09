import {
  ActionIcon,
  Badge,
  Button,
  Container,
  createTheme,
  Input,
  type MantineColorsTuple,
  Paper,
  rem,
  SegmentedControl,
  Text,
  Tooltip,
} from "@mantine/core";

// The logo's green, as a Mantine ramp: shade 6 is the mark itself (#3BB273).
const tastebudGreen: MantineColorsTuple = [
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
 * Every shadow the review UI draws, applied by name through a component's `shadow` prop. The selected
 * Inbox card gets one 1px green ring that thickens its border into a single outline (not a halo stacked
 * on a border and a focus ring); a live thread listener gets a soft 3px ring.
 */
const reviewShadows = {
  selectedCard: "0 0 0 1px var(--mantine-color-tastebud-6)",
  listeningDot: "0 0 0 3px var(--mantine-color-teal-1)",
};

/**
 * The one content width, in px, every page sits in: the shell's bar and its main column both use it
 * through Container's default size, so a page fills the column instead of choosing its own width.
 */
const reviewPageWidth = 1120;

const remScale = (scale: Readonly<Record<string, number>>): Record<string, string> =>
  Object.fromEntries(Object.entries(scale).map(([name, px]) => [name, rem(px)]));

/**
 * The control ladder, in px: at each size, a Button, an ActionIcon sized `input-<size>`, a TextInput or Select,
 * and a SegmentedControl stand the same height, so controls in one row line up. `sm` is the default.
 * `compact-sm` keeps its tighter padding but takes the `sm` height, so it can sit in a row too.
 */
const controlHeights = { xs: 28, sm: 32, md: 36 } as const;

/** A control's `size` prop as Mantine types it: a named size or a number of px. */
type MantineControlSize = string | number | undefined;

const buttonHeights = new Map<MantineControlSize, number>([
  ...Object.entries(controlHeights),
  ["compact-sm", controlHeights.sm],
]);
const actionIconHeights = new Map<MantineControlSize, number>(
  Object.entries(controlHeights).map(([size, px]) => [`input-${size}`, px]),
);

/** A size's ladder height; none for sizes off the ladder, which keep Mantine's own. */
const ladderHeightOf = (heights: ReadonlyMap<MantineControlSize, number>, size: MantineControlSize) => {
  const px = heights.get(size);
  return px === undefined ? undefined : rem(px);
};

/**
 * A SegmentedControl has no height variable: its 4px track padding plus each label's line (14px type at
 * Mantine's 1.55 line height) set it, so the label's vertical padding makes up the rest of the `sm` height.
 */
const segmentedLabelPaddingY = (controlHeights.sm - 8 - 14 * 1.55) / 2;

/** A quiet, light reviewing tool: neutral ground, the logo's green as the one accent, colour reserved for state. */
export const tastebudMantineTheme = createTheme({
  primaryColor: "tastebud",
  colors: { tastebud: tastebudGreen },
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
    Button: Button.extend({
      defaultProps: { size: "sm" },
      vars: (_theme, props) => ({ root: { "--button-height": ladderHeightOf(buttonHeights, props.size) } }),
    }),
    Input: Input.extend({
      vars: (_theme, props) => ({ wrapper: { "--input-height": ladderHeightOf(buttonHeights, props.size ?? "sm") } }),
    }),
    SegmentedControl: SegmentedControl.extend({
      defaultProps: { size: "sm" },
      vars: (_theme, props) => ({
        root: props.size === "sm" ? { "--sc-padding": `${rem(segmentedLabelPaddingY)} ${rem(10)}` } : {},
      }),
    }),
    Container: Container.extend({ defaultProps: { size: reviewPageWidth } }),
    ActionIcon: ActionIcon.extend({
      defaultProps: { radius: "md" },
      vars: (_theme, props) => ({ root: { "--ai-size": ladderHeightOf(actionIconHeights, props.size) } }),
    }),
    // Every chip keeps one size and never shrinks: in a tight row the text beside it wraps or truncates instead.
    Badge: Badge.extend({
      defaultProps: { radius: "sm", variant: "light", size: "md", tt: "none", fw: 500 },
      styles: { root: { flexShrink: 0 }, label: { overflow: "visible" } },
    }),
    Text: Text.extend({ defaultProps: { size: "sm" } }),
    Paper: Paper.extend({ defaultProps: { withBorder: true, radius: "md" } }),
    Tooltip: Tooltip.extend({ defaultProps: { openDelay: 250, fz: "xs" } }),
  },
});
