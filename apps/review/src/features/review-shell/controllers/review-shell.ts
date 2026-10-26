import { createServerFn } from "@tanstack/react-start";

import { loadKnownPlaces, loadReviewShell } from "../service/review-shell.ts";

export const fetchReviewShell = createServerFn({ method: "GET" }).handler(() => loadReviewShell());

/** Every place in use, for autocomplete and label disambiguation on every screen. */
export const fetchKnownPlaces = createServerFn({ method: "GET" }).handler(() => loadKnownPlaces());
