import { createServerFn } from "@tanstack/react-start";

import { loadAgentHostConnections } from "../service/settings.ts";

export const fetchAgentHostConnections = createServerFn({ method: "GET" }).handler(() => loadAgentHostConnections());
