import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({ word: { display: "inline-block" } });

/**
 * Text whose ellipsis lands between words. Inside a line-clamped parent (`lineClamp`), each word is an atomic
 * inline box, so the browser drops a whole word to make room for the "…" instead of cutting one in half.
 */
export function WordBoundaryText({ text }: { text: string }) {
  return text.split(/\s+/).map((word, index) => (
    // Words repeat ("the", "a"), so the position is part of the key; the list never reorders.
    // oxlint-disable-next-line react/no-array-index-key
    <span key={`${index}-${word}`}>
      <span {...stylex.props(styles.word)}>{word}</span>{" "}
    </span>
  ));
}
