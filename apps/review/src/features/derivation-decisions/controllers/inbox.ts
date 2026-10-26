import { createServerFn } from "@tanstack/react-start";

import { loadInboxGroups } from "../service/derivation-decisions.ts";

export const fetchInboxGroups = createServerFn({ method: "GET" }).handler(() => loadInboxGroups());
