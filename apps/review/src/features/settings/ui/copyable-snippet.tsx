import { ActionIcon, Box, Code, CopyButton, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { Check, Copy } from "lucide-react";

const styles = stylex.create({
  // Every command gets the same frame, as wide as its text (up to the column), with copy inside it.
  snippet: { position: "relative", width: "fit-content", maxWidth: "100%" },
  // Wraps long paths so nothing hides behind horizontal scroll; the copied text keeps its own lines.
  code: {
    fontFamily: "var(--mantine-font-family-monospace)",
    whiteSpace: "pre-wrap",
    wordBreak: "normal",
    overflowWrap: "anywhere",
    paddingRight: "40px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--mantine-color-gray-3)",
    borderRadius: "var(--mantine-radius-sm)",
  },
  copy: { position: "absolute", top: "6px", right: "6px" },
});

/** A command or config block to paste, with its copy button inside the frame. */
export function CopyableSnippet({ code, label }: { code: string; label: string }) {
  return (
    <Box {...stylex.props(styles.snippet)}>
      <Code block fz="xs" {...stylex.props(styles.code)} aria-label={label}>
        {code}
      </Code>
      <CopyButton value={code}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
            <ActionIcon
              size="sm"
              variant="default"
              aria-label={`Copy ${label}`}
              onClick={copy}
              {...stylex.props(styles.copy)}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Box>
  );
}
