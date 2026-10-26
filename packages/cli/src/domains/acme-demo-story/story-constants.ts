/** The Acme demo story's cast, places, calls and calendar. Invented, all of it. */
export const SEED_PROCESS = "process:seed";
/** Dana's coding agent, which captures their corrections and proposes beliefs. */
export const CODING_AGENT = "claude-code/2.1";
/** The Granola sweep that captures call quotes, and the agent that proposes insights and ideas from them. */
export const CALL_SWEEP = "process:granola-sweep";
export const RESEARCH_AGENT = "codex/1.4";

export const WEB = "github.com/acme/web::";
export const CHECKOUT = "github.com/acme/web::apps/checkout";
export const BILLING = "github.com/acme/billing-api::";
export const BILLING_WEBHOOKS = "github.com/acme/billing-api::src/webhooks";
/** acme/web's name until October. Beliefs accepted under it are what the scope audit reports unmatched. */
export const STOREFRONT = "github.com/acme/storefront::";
export const ACME = "clients/acme";

export const JORDAN = { said_by: "slack:acme/U04JORDAN", said_by_label: "Jordan (Acme marketing)" } as const;
export const PRIYA = { said_by: "email:priya.n@example.com", said_by_label: "Priya N. (subscriber)" } as const;
export const TOM = { said_by: "email:tom@harbourcafe.example", said_by_label: "Tom W. (café owner)" } as const;
export const LENA = { said_by: "email:lena.k@example.com", said_by_label: "Lena K. (former subscriber)" } as const;

export const CALL_PRIYA = "granola://meetings/2026-09-18-subscriber-interview-priya";
export const CALL_TOM = "granola://meetings/2026-09-25-wholesale-call-tom";
export const CALL_LENA = "granola://meetings/2026-10-08-churn-call-lena";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
/** The story runs September to late October 2026; no stamp lands after this. */
export const SEED_STORY_END_MS = Date.parse("2026-10-24T17:00:00-07:00");

/** Dana reviews the inbox about a day after a proposal arrives. */
export const REVIEW_GAP_MS = 20 * HOUR_MS;
