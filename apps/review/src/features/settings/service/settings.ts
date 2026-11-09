import { readAgentHostConnections } from "../repo/settings.server.ts";

/** Whether each agent host is wired to this store, as its own config says. */
export const loadAgentHostConnections = () => readAgentHostConnections();
