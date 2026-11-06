/**
 * Where a source's words were said. Only http(s) addresses are links: a Claude Code transcript address names a
 * session the owner can resume, not a page, so it shows that session with the resume command to copy.
 */
import { ActionIcon, Anchor, CopyButton, Group, Text, Tooltip } from "@mantine/core";
import { claudeCodeTranscriptSessionOf } from "@tastebud/core/claude-code-transcript";
import { Copy, ExternalLink, SquareTerminal } from "lucide-react";

type SourceAddressDisplay =
  | { readonly form: "web"; readonly url: string }
  | { readonly form: "claude-code-session"; readonly session: string; readonly resume: string }
  | { readonly form: "plain"; readonly text: string };

const displayOfSourceAddress = (address: string): SourceAddressDisplay => {
  const session = claudeCodeTranscriptSessionOf(address);
  if (session !== undefined) return { form: "claude-code-session", session, resume: `claude --resume ${session}` };
  return /^https?:\/\//i.test(address) ? { form: "web", url: address } : { form: "plain", text: address };
};

const SESSION_ID_SHOWN = 8;

const describeClaudeCodeSession = (session: string) => `Claude Code session ${session.slice(0, SESSION_ID_SHOWN)}`;

/** The address in full, for the source page. */
function SourceAddressLine({ address }: { address: string }) {
  const shape = displayOfSourceAddress(address);
  switch (shape.form) {
    case "web":
      return (
        <Anchor href={shape.url} target="_blank" rel="noreferrer" size="sm">
          <Group gap="2xs" wrap="nowrap">
            {shape.url}
            <ExternalLink size={12} />
          </Group>
        </Anchor>
      );
    case "claude-code-session":
      return (
        <Group gap="2xs" wrap="nowrap">
          <Text size="sm" title={shape.session}>
            {describeClaudeCodeSession(shape.session)}
          </Text>
          <CopyButton value={shape.resume}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? "Copied" : `Copy \`${shape.resume}\`, to run where it was said`} withArrow>
                <ActionIcon variant="subtle" color="gray" size="xs" aria-label="Copy the resume command" onClick={copy}>
                  <SquareTerminal size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
      );
    case "plain":
      return <Text size="sm">{shape.text}</Text>;
  }
}

/** The address as one small icon beside a quote: a link, or a copy of the resume command or the text. */
function SourceAddressIcon({ address }: { address: string }) {
  const shape = displayOfSourceAddress(address);
  if (shape.form === "web")
    return (
      <Tooltip label="Open where it was said" withArrow>
        <ActionIcon
          component="a"
          href={shape.url}
          target="_blank"
          rel="noreferrer"
          variant="subtle"
          color="gray"
          size="xs"
          aria-label="Open where it was said"
        >
          <ExternalLink size={12} />
        </ActionIcon>
      </Tooltip>
    );
  const [copyValue, label] =
    shape.form === "claude-code-session"
      ? [shape.resume, `${describeClaudeCodeSession(shape.session)}: copy \`${shape.resume}\``]
      : [shape.text, `Said at ${shape.text}: copy it`];
  return (
    <CopyButton value={copyValue}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Copied" : label} withArrow>
          <ActionIcon variant="subtle" color="gray" size="xs" aria-label="Copy where it was said" onClick={copy}>
            {shape.form === "claude-code-session" ? <SquareTerminal size={12} /> : <Copy size={12} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

/** Where a source was said: `line` spells it out (the source page), `icon` sits beside a quote. */
export function SourceAddress({ address, variant }: { address: string; variant: "line" | "icon" }) {
  return variant === "line" ? <SourceAddressLine address={address} /> : <SourceAddressIcon address={address} />;
}
