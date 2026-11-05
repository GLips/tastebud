/**
 * MCP prompts: `setup`, the interview that writes a store's config. Claude Code lists a server's
 * prompts as slash commands (`/mcp__tastebud__setup`). The text is core's, shared with `tastebud setup-guide`.
 */
import { TASTEBUD_SETUP_INTERVIEW } from "@tastebud/core/store-config";

import { invalidMcpParams } from "#mcp/infrastructure/mcp-sdk.ts";

const SETUP_PROMPT = {
  name: "setup",
  title: "Set up Tastebud",
  description:
    "Interview the owner and write this Tastebud store's config: whose words to keep, what conclusions to draw, where work happens.",
};

export const listTastebudMcpPrompts = () => ({ prompts: [SETUP_PROMPT] });

/** The prompt's messages; any other name is an invalid-params error, as the protocol asks. */
export const getTastebudMcpPrompt = (name: string) => {
  if (name !== SETUP_PROMPT.name)
    throw invalidMcpParams(`No prompt named ${name}. Tastebud's prompts: ${SETUP_PROMPT.name}.`);
  return {
    description: SETUP_PROMPT.description,
    messages: [{ role: "user" as const, content: { type: "text" as const, text: TASTEBUD_SETUP_INTERVIEW } }],
  };
};
