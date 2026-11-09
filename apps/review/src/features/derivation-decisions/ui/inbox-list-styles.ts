/**
 * The inbox queue's one list surface: a bordered box whose section headers and rows are split by
 * hairlines, as in a mail list, rather than a card per row.
 */
import * as stylex from "@stylexjs/stylex";

export const inboxListStyles = stylex.create({
  // `clip`, not `hidden`: it rounds the corners without becoming a scroll box, so sticky headers still stick.
  surface: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--mantine-color-gray-3)",
    borderRadius: "var(--mantine-radius-md)",
    backgroundColor: "var(--mantine-color-white)",
    overflow: "clip",
  },
  // Every row and section header but the list's first carries the hairline above it.
  divided: {
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--mantine-color-gray-2)",
  },
});
