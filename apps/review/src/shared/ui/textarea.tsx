/**
 * The one free-text box: grows with its text, and ⌘↵ (Ctrl+↵) submits. Every note, reason and case the
 * owner writes goes through here so the shortcut behaves the same everywhere.
 */
import { Textarea, type TextareaProps } from "@mantine/core";
import type { ComponentPropsWithoutRef } from "react";

export type ReviewTextareaProps = TextareaProps &
  Omit<ComponentPropsWithoutRef<"textarea">, keyof TextareaProps | "onKeyDown"> & {
    /** ⌘↵ or Ctrl+↵. */
    readonly onSubmitShortcut: () => void;
    /** Esc; omitted where Esc should fall through to an enclosing modal. */
    readonly onCancelShortcut?: () => void;
  };

export function ReviewTextarea({ onSubmitShortcut, onCancelShortcut, ...props }: ReviewTextareaProps) {
  return (
    <Textarea
      autosize
      {...props}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onSubmitShortcut();
        }
        if (event.key === "Escape" && onCancelShortcut !== undefined) onCancelShortcut();
      }}
    />
  );
}
