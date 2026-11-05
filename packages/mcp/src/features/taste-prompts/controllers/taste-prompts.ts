/**
 * MCP prompts: `setup`, the interview that writes a store's config. Claude Code lists a server's
 * prompts as slash commands (`/mcp__taste__setup`). The text is core's, shared with `taste setup-guide`.
 */
import { TASTE_SETUP_INTERVIEW } from "@taste/core/store-config";

import { invalidMcpParams } from "#mcp/infrastructure/mcp-sdk.ts";

const SETUP_PROMPT = {
  name: "setup",
  title: "Set up Taste",
  description:
    "Interview the owner and write this Taste store's config: whose words to keep, what conclusions to draw, where work happens.",
};

export const listTasteMcpPrompts = () => ({ prompts: [SETUP_PROMPT] });

/** The prompt's messages; any other name is an invalid-params error, as the protocol asks. */
export const getTasteMcpPrompt = (name: string) => {
  if (name !== SETUP_PROMPT.name)
    throw invalidMcpParams(`No prompt named ${name}. Taste's prompts: ${SETUP_PROMPT.name}.`);
  return {
    description: SETUP_PROMPT.description,
    messages: [{ role: "user" as const, content: { type: "text" as const, text: TASTE_SETUP_INTERVIEW } }],
  };
};
