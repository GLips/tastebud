/**
 * Single-key hotkeys (j, x, a, r…) that still fire after a click on a checkbox, radio or tab, and stay out
 * of the way while text is being typed. The library's own ignoreInputs counts a focused checkbox as an
 * input, so clicking a row's checkbox and pressing r would do nothing.
 */
import { type UseHotkeyDefinition, useHotkeys } from "@tanstack/react-hotkeys";

/** Input types that take no typing: a key pressed on one is meant for the page. */
const NON_TEXT_INPUT_TYPES = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"]);

const typesText = (element: Element | null): boolean =>
  element instanceof HTMLInputElement
    ? !NON_TEXT_INPUT_TYPES.has(element.type)
    : element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      (element instanceof HTMLElement && element.isContentEditable);

export function useReviewHotkeys(definitions: ReadonlyArray<UseHotkeyDefinition>) {
  useHotkeys(
    definitions.map((definition) => ({
      ...definition,
      callback: (event, context) => {
        if (typesText(event.target instanceof Element ? event.target : null)) return;
        if (definition.options?.preventDefault !== false) event.preventDefault();
        definition.callback(event, context);
      },
      // The library would prevent the default before this callback runs, eating the letter typed in a field.
      options: { ...definition.options, ignoreInputs: false, preventDefault: false },
    })),
  );
}
