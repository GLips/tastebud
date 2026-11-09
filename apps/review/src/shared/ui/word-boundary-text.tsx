import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({ word: { display: "inline-block" } });

/** A word and the punctuation closing it (`confirmed.`, `this,”`), or no punctuation. */
const TRAILING_PUNCTUATION = /^(.+?)([.,;:!?…]+["”’)]*)$/u;

/** U+2060 WORD JOINER: no line break between the boxes either side, so punctuation never starts a line. */
const WORD_JOINER = "⁠";

interface WordBox {
  readonly text: string;
  /** The next box starts with this one's punctuation, so the two must stay on one line. */
  readonly joinsNext: boolean;
}

/**
 * The text as unbreakable boxes. A word's closing punctuation moves into the next word's box ("confirmed" then
 * ". Every"), so when a clamp drops that next word it drops the punctuation with it: "confirmed…", never
 * "confirmed.…". The last word keeps its own.
 */
const wordBoxesOf = (text: string): ReadonlyArray<WordBox> => {
  const words = text.split(/\s+/).filter((word) => word !== "");
  let carried = "";
  return words.map((word, index) => {
    const split = index < words.length - 1 ? TRAILING_PUNCTUATION.exec(word) : null;
    const box = { text: carried + (split?.[1] ?? word), joinsNext: split !== null };
    carried = split === null ? "" : `${split[2]} `;
    return box;
  });
};

/**
 * Text whose ellipsis lands between words. Inside a line-clamped parent (`lineClamp`), each word is an atomic
 * inline box, so the browser drops a whole word to make room for the "…" instead of cutting one in half.
 */
export function WordBoundaryText({ text }: { text: string }) {
  return wordBoxesOf(text).map((box, index) => (
    // Words repeat ("the", "a"), so the position is part of the key; the list never reorders.
    // oxlint-disable-next-line react/no-array-index-key
    <span key={`${index}-${box.text}`}>
      <span {...stylex.props(styles.word)}>{box.text}</span>
      {box.joinsNext ? WORD_JOINER : " "}
    </span>
  ));
}
