/** The MCP server's log: stderr, because stdout carries the protocol. */
export const writeTasteMcpServerLog = (text: string): void => void process.stderr.write(text);
