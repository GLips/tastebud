/** The guard every decide and Undo button shares against a double click's second click. */
import type { MouseEvent } from "react";

/**
 * A click handler that ignores the second click of a double click. Deciding folds a card and Undo
 * unfolds it, so whatever lands under the cursor must not take a click meant for the button before.
 */
export const ignoringRepeatClicks =
  (onClick: () => void) =>
  (event: MouseEvent): void => {
    if (event.detail <= 1) onClick();
  };
